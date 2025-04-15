let currentQuery = "";
let currentResults = [];

if (!document.querySelector("#start-hour option[value='1']")) {
  const fillHours = () => {
    const startHour = document.getElementById("start-hour");
    const endHour = document.getElementById("end-hour");
    if (startHour.options.length <= 1 && endHour.options.length <= 1) {
      for (let i = 0; i < 24; i++) {
        const opt1 = document.createElement("option");
        opt1.value = i;
        opt1.textContent = `${i}:00`;
        startHour.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = i;
        opt2.textContent = `${i}:00`;
        endHour.appendChild(opt2);
      }
    }
  };
  fillHours();
}

const form = document.getElementById("query-form");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearVisuals();

  const formData = new FormData(form);
  currentQuery = formData.get("query");

  fetch("/analyze", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        fetch("/static/bluesky_sentiment.json")
          .then((res) => res.json())
          .then((data) => {
            currentResults = data;
            visualizePosts(data);
          });
      } else {
        alert("Error: " + data.error);
      }
    })
    .catch((err) => alert("Request failed: " + err));
});

const saveButton = document.getElementById("save-button");
saveButton.addEventListener("click", () => {
  if (!currentResults.length) {
    alert("No results loaded to save.");
    return;
  }
  const query = currentQuery;

  if (!query) return;

  fetch("/save_result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, results: currentResults }),
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.success) {
        loadSavedList();
      } else {
        alert("Error saving: " + res.error);
      }
    });
});

function loadSavedList() {
  fetch("/saved_list")
    .then((res) => res.json())
    .then((files) => {
      const select = document.getElementById("load-select");
      select.innerHTML = `<option value="">Load Saved Search</option>`;
      files
        .filter((file) => file.endsWith(".json"))
        .forEach((file) => {
          const opt = document.createElement("option");
          opt.value = file;
          opt.textContent = file;
          select.appendChild(opt);
        });
    });
}
loadSavedList();

const loadSelect = document.getElementById("load-select");
loadSelect.addEventListener("change", (e) => {
  const file = e.target.value;
  if (!file) return;

  fetch(`/saved/${file}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.error) return alert("Could not load file: " + data.error);
      currentQuery = file.split("-").slice(1).join(" ").replace(".json", "");
      currentResults = data;

      clearVisuals();
      visualizePosts(data);
    });
});

function clearVisuals() {
  d3.select("#card-grid").html("");
  d3.selectAll("#top-authors-chart svg, #top-domains-chart svg").remove();
  d3.select("#chart").html("");
  d3.select("#daily-chart").html("");
  d3.select("#word-cloud").html("");
}

function visualizePosts(data) {
  currentResults = data;

  const authorCounts = {};
  data.forEach((d) => {
    const author = d.author;
    authorCounts[author] = (authorCounts[author] || 0) + 1;
  });

  const topAuthors = Object.entries(authorCounts)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 23);

  const domainCounts = {};
  data.forEach((d) => {
    if (d.links && Array.isArray(d.links)) {
      d.links.forEach((link) => {
        try {
          const domain = new URL(link).hostname;
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        } catch (error) {}
      });
    }
  });
  const topDomains = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 23);

  renderHorizontalBarChart({
    containerId: "#top-authors-chart",
    data: topAuthors,
    categoryKey: "author",
    valueKey: "count",
  });

  renderHorizontalBarChart({
    containerId: "#top-domains-chart",
    data: topDomains,
    categoryKey: "domain",
    valueKey: "count",
  });

  function renderHorizontalBarChart({
    containerId,
    data,
    categoryKey,
    valueKey,
  }) {
    const margin = { top: 20, right: 100, bottom: 30, left: 150 },
      width = window.innerWidth * 0.45 - margin.left - margin.right,
      height = 500 - margin.top - margin.bottom;

    const svg = d3
      .select(containerId)
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const y = d3
      .scaleBand()
      .domain(data.map((d) => d[categoryKey]))
      .range([0, height])
      .padding(0.1);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d[valueKey])])
      .nice()
      .range([0, width]);

    svg
      .selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d[categoryKey]))
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", (d) => x(d[valueKey]))
      .attr("fill", "steelblue");

    svg
      .selectAll(".label")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr("y", (d) => y(d[categoryKey]) + y.bandwidth() / 2)
      .attr("x", (d) => x(d[valueKey]) + 5)
      .attr("dy", ".35em")
      .text((d) => d[valueKey]);

    svg.append("g").call(d3.axisLeft(y));

    svg
      .append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x).ticks(5));
  }

  const sentimentGroups = {
    positive: data.filter((d) => d.sentiment > 0.2).length,
    neutral: data.filter((d) => d.sentiment >= -0.2 && d.sentiment <= 0.2)
      .length,
    negative: data.filter((d) => d.sentiment < -0.2).length,
  };

  const svg = d3.select("#chart");
  const width = window.innerWidth * 0.45 - 115;
  const height = +svg.attr("height") - 60;
  const g = svg.append("g").attr("transform", "translate(40,20)");

  const x = d3
    .scaleBand()
    .domain(["positive", "neutral", "negative"])
    .range([0, width])
    .padding(0.4);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(Object.values(sentimentGroups))])
    .range([height, 0]);

  g.selectAll(".bar")
    .data(Object.entries(sentimentGroups))
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d[0]))
    .attr("y", (d) => y(d[1]))
    .attr("width", x.bandwidth())
    .attr("height", (d) => height - y(d[1]))
    .attr("fill", (d) =>
      d[0] === "positive" ? "green" : d[0] === "neutral" ? "gray" : "crimson"
    );

  g.selectAll(".bar-label")
    .data(Object.entries(sentimentGroups))
    .enter()
    .append("text")
    .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
    .attr("y", (d) => y(d[1]) - 5)
    .attr("text-anchor", "middle")
    .text((d) => d[1]);

  g.append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x));
  g.append("g").call(d3.axisLeft(y));

  const dailyPosts = {};
  data.forEach((d) => {
    const day = d.created_at.substring(0, 10);
    dailyPosts[day] = (dailyPosts[day] || 0) + 1;
  });

  const dailyData = Object.entries(dailyPosts)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => d3.ascending(a.day, b.day));

  const svgDaily = d3.select("#daily-chart");
  const dailyWidth = window.innerWidth * 0.45 - 115;
  const dailyHeight = +svgDaily.attr("height") - 60;
  const gDaily = svgDaily.append("g").attr("transform", "translate(40,20)");

  const xDaily = d3
    .scaleBand()
    .domain(dailyData.map((d) => d.day))
    .range([0, dailyWidth])
    .padding(0.4);
  const yDaily = d3
    .scaleLinear()
    .domain([0, d3.max(dailyData, (d) => d.count)])
    .range([dailyHeight, 0]);

  gDaily
    .selectAll(".bar")
    .data(dailyData)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => xDaily(d.day))
    .attr("y", (d) => yDaily(d.count))
    .attr("width", xDaily.bandwidth())
    .attr("height", (d) => dailyHeight - yDaily(d.count))
    .attr("fill", "steelblue");

  gDaily
    .selectAll(".bar-label")
    .data(dailyData)
    .enter()
    .append("text")
    .attr("x", (d) => xDaily(d.day) + xDaily.bandwidth() / 2)
    .attr("y", (d) => yDaily(d.count) - 5)
    .attr("text-anchor", "middle")
    .text((d) => d.count);

  gDaily
    .append("g")
    .attr("transform", `translate(0, ${dailyHeight})`)
    .call(d3.axisBottom(xDaily))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  gDaily.append("g").call(d3.axisLeft(yDaily));

  const wcWidth = window.innerWidth * 0.45 - 60,
    wcHeight = 500;

  let allText = data.map((d) => d.text).join(" ");
  allText = allText.toLowerCase().replace(/[^a-z\s]/g, " ");

  const wordsArray = allText.split(/\s+/).filter((word) => word.length > 2);

  const frequency = {};
  wordsArray.forEach((word) => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  const wordEntries = Object.entries(frequency).map(([word, count]) => ({
    text: word,
    size: count,
  }));

  d3.layout
    .cloud()
    .size([wcWidth, wcHeight])
    .words(wordEntries)
    .padding(5)
    .rotate(() => (Math.random() < 0.5 ? 0 : 90))
    .font("Impact")
    .fontSize((d) => 10 + d.size * 2)
    .on("end", drawWordCloud)
    .start();

  function drawWordCloud(words) {
    d3.select("#word-cloud")
      .append("svg")
      .attr("width", wcWidth)
      .attr("height", wcHeight)
      .append("g")
      .attr("transform", "translate(" + wcWidth / 2 + "," + wcHeight / 2 + ")")
      .selectAll("text")
      .data(words)
      .enter()
      .append("text")
      .style("font-size", (d) => d.size + "px")
      .style("font-family", "Impact")
      .style("fill", () => d3.schemeCategory10[Math.floor(Math.random() * 10)])
      .attr("text-anchor", "middle")
      .attr(
        "transform",
        (d) => "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")"
      )
      .text((d) => d.text);
  }

  const container = d3.select("#card-grid");
  data.forEach((post) => {
    const sentimentClass =
      post.sentiment > 0.2
        ? "positive"
        : post.sentiment < -0.2
        ? "negative"
        : "neutral";

    const card = container.append("div").attr("class", "card");

    card
      .append("div")
      .attr("class", `sentiment ${sentimentClass}`)
      .text(`Sentiment Score: ${post.sentiment.toFixed(2)}`);

    const textBlock = card.append("div").attr("class", "text");
    textBlock
      .append("div")
      .attr("class", "text-label")
      .html(`<strong>Post Content:</strong>`);
    textBlock.append("div").html(post.text);

    card.append("div").attr("class", "meta").html(`
            <strong class="meta">Author:</strong> <span class="meta-text">${
              post.author
            }</span><br>
            <strong class="meta">Time:</strong> <span class="meta-text">${
              post.created_at
            }</span><br>
            <strong class="meta">Post URL:</strong> <a href="${
              post.post_url
            }" target="_blank">View</a><br>
            ${
              post.reply_to
                ? `<strong class="meta">Reply To:</strong> <span class="meta-text">${post.reply_to
                    .split("/")
                    .pop()}<br>`
                : ""
            }
          `);

    if (post.links && post.links.length) {
      const linkList = post.links
        .map((url) => `<li><a href="${url}" target="_blank">${url}</a></li>`)
        .join("");
      card.append("div").attr("class", "meta").html(`
              <strong class="meta">Detected Links:</strong>
              <ul style="margin: 0.5rem 0 0 0rem;">
                ${linkList}
              </ul>
            `);
    }

    if (post.images && post.images.length) {
      const imgContainer = card.append("div").attr("class", "meta");
      imgContainer.append("strong").text("Attached Images:");
      post.images.forEach((url) => {
        imgContainer
          .append("img")
          .attr("src", url)
          .attr(
            "style",
            "min-width: 100%; max-width: 100%; border-radius: 8px; margin-top: 0.5rem;"
          );
      });
    }

    if (post.external_embed && post.external_embed.uri) {
      const embed = post.external_embed;
      const isYouTube =
        embed.uri.includes("youtube.com") || embed.uri.includes("youtu.be");
      if (isYouTube) {
        const videoId =
          embed.uri.split("v=")[1]?.split("&")[0] || embed.uri.split("/").pop();
        card.append("div").attr("class", "meta").html(`
                <strong class="meta">YouTube Embed:</strong><br>
                <iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
              `);
      }
    }
  });
}
