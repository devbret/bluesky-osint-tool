let currentQuery = "";
let currentResults = [];

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

      select.innerHTML = "";

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

document.getElementById("load-button").addEventListener("click", async () => {
  const select = document.getElementById("load-select");
  const selected = Array.from(select.selectedOptions)
    .map((opt) => opt.value)
    .filter((val) => val);

  if (selected.length === 0) {
    alert("Please select at least one saved search.");
    return;
  }

  try {
    const results = await Promise.all(
      selected.map(async (filename) => {
        const response = await fetch(`/saved/${encodeURIComponent(filename)}`);
        if (!response.ok) {
          throw new Error(`Failed to load ${filename}: ${response.status}`);
        }
        return response.json();
      })
    );

    const combined = results
      .flat()
      .sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeA - timeB;
      })
      .reverse();

    console.log("Chronologically Sorted Results:", combined);
    clearVisuals();
    visualizePosts(combined);
  } catch (err) {
    console.error("Error loading files:", err);
    alert(`Error: ${err.message}`);
  }
});

loadSavedList();

function clearVisuals() {
  d3.select("#card-grid").html("");
  d3.selectAll("#top-authors-chart, #top-domains-chart").html("");
  d3.select("#bar-chart").html("");
  d3.select("#daily-posts-chart").html("");
  d3.select("#top-languages-chart").html("");
  d3.select("#word-cloud").html("");
  d3.select("#bigram-cloud").html("");
  d3.select("#trigram-cloud").html("");
  d3.select("#hourly-posts-chart").html("");
  d3.select("#weekly-heatmap-chart").html("");
  d3.select("#hourly-metrics-chart").html("");
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

  const langCounts = {};

  data.forEach((d) => {
    (d.langs || []).forEach((lang) => {
      langCounts[lang] = (langCounts[lang] || 0) + 1;
    });
  });

  const topLangs = Object.entries(langCounts)
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count);

  renderHorizontalBarChart({
    containerId: "#top-authors-chart",
    data: topAuthors,
    categoryKey: "author",
    valueKey: "count",
    title: "Top Authors",
  });

  renderHorizontalBarChart({
    containerId: "#top-domains-chart",
    data: topDomains,
    categoryKey: "domain",
    valueKey: "count",
    title: "Top Domains",
  });

  renderHorizontalBarChart({
    containerId: "#top-languages-chart",
    data: topLangs,
    categoryKey: "lang",
    valueKey: "count",
    title: "Top Languages",
    customMargin: { top: 20, right: 100, bottom: 30, left: 43 },
  });

  function renderHorizontalBarChart({
    containerId,
    data,
    categoryKey,
    valueKey,
    title,
    customMargin = null,
  }) {
    const container = d3.select(containerId);
    container.html("");
    container.append("h3").text(title);

    const margin = customMargin || {
      top: 20,
      right: 100,
      bottom: 30,
      left: 150,
    };
    (width = window.innerWidth * 0.45 - margin.left - margin.right),
      (height = 500 - margin.top - margin.bottom);

    const svg = container
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
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5));
  }

  const sentimentGroups = {
    positive: data.filter((d) => d.sentiment > 0.2).length,
    neutral: data.filter((d) => d.sentiment >= -0.2 && d.sentiment <= 0.2)
      .length,
    negative: data.filter((d) => d.sentiment < -0.2).length,
  };

  const margin = { top: 20, right: 20, bottom: 60, left: 40 };

  const chartWidth = window.innerWidth * 0.45 - margin.left - margin.right - 75;
  const chartHeight = 500 - margin.top - margin.bottom;

  d3.select("#bar-chart").append("h3").text("Sentiment Distribution");

  const svg = d3
    .select("#bar-chart")
    .append("svg")
    .attr("width", chartWidth + margin.left + margin.right)
    .attr("height", chartHeight + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(["positive", "neutral", "negative"])
    .range([0, chartWidth])
    .padding(0.4);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(Object.values(sentimentGroups))])
    .range([chartHeight, 0]);

  svg
    .selectAll(".bar")
    .data(Object.entries(sentimentGroups))
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d[0]))
    .attr("y", (d) => y(d[1]))
    .attr("width", x.bandwidth())
    .attr("height", (d) => chartHeight - y(d[1]))
    .attr("fill", (d) =>
      d[0] === "positive" ? "green" : d[0] === "neutral" ? "gray" : "crimson"
    );

  svg
    .selectAll(".bar-label")
    .data(Object.entries(sentimentGroups))
    .enter()
    .append("text")
    .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
    .attr("y", (d) => y(d[1]) - 5)
    .attr("text-anchor", "middle")
    .text((d) => d[1]);

  svg
    .append("g")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(d3.axisBottom(x));

  svg.append("g").call(d3.axisLeft(y));

  d3.select("#daily-posts-chart").append("h3").text("Posts Per Day");

  const dailyPosts = {};
  data.forEach((d) => {
    const day = d.created_at.substring(0, 10);
    dailyPosts[day] = (dailyPosts[day] || 0) + 1;
  });

  const parseDay = d3.timeParse("%Y-%m-%d");
  const formatDay = d3.timeFormat("%Y-%m-%d");

  const days = Object.keys(dailyPosts).map(parseDay).sort(d3.ascending);
  const minDay = days[0];
  const maxDay = days[days.length - 1];

  const allDays = d3.timeDay.range(minDay, d3.timeDay.offset(maxDay, 1));

  const dailyDataFull = allDays.map((dt) => ({
    date: dt,
    count: dailyPosts[formatDay(dt)] || 0,
  }));

  const xBand = d3
    .scaleBand()
    .domain(allDays.map((dt) => formatDay(dt)))
    .range([0, chartWidth])
    .padding(0.4);

  const xTime = d3.scaleTime().domain([minDay, maxDay]).range([0, chartWidth]);

  const yDaily = d3
    .scaleLinear()
    .domain([0, d3.max(dailyDataFull, (d) => d.count)])
    .nice()
    .range([chartHeight, 0]);

  const svgDaily = d3
    .select("#daily-posts-chart")
    .append("svg")
    .attr("width", chartWidth + margin.left + margin.right)
    .attr("height", chartHeight + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  svgDaily
    .selectAll(".bar")
    .data(dailyDataFull)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => xBand(formatDay(d.date)))
    .attr("y", (d) => yDaily(d.count))
    .attr("width", xBand.bandwidth())
    .attr("height", (d) => chartHeight - yDaily(d.count))
    .attr("fill", "steelblue");

  svgDaily
    .selectAll(".bar-label")
    .data(dailyDataFull)
    .enter()
    .append("text")
    .attr("class", "bar-label")
    .attr("x", (d) => xBand(formatDay(d.date)) + xBand.bandwidth() / 2)
    .attr("y", (d) => yDaily(d.count) - 5)
    .attr("text-anchor", "middle")
    .text((d) => d.count);

  const tickCountDaily = Math.min(allDays.length, 10);
  svgDaily
    .append("g")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(
      d3
        .axisBottom(xTime)
        .ticks(tickCountDaily)
        .tickFormat(d3.timeFormat("%m-%d"))
    )
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("dy", "0.5em");

  svgDaily.append("g").call(d3.axisLeft(yDaily));

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

  d3.select("#word-cloud").append("h3").text("Word Cloud");

  d3.layout
    .cloud()
    .size([wcWidth, wcHeight])
    .words(wordEntries)
    .padding(5)
    .rotate(() => (Math.random() < 0.5 ? 0 : 90))
    .font("Impact")
    .fontSize((d) => 10 + d.size)
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

  let allTextBigram = data
    .map((d) => d.text)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ");
  const wordsArrayBigram = allTextBigram
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const bigrams = [];
  for (let i = 0; i < wordsArrayBigram.length - 1; i++) {
    bigrams.push(wordsArrayBigram[i] + " " + wordsArrayBigram[i + 1]);
  }

  const bigramFreq = {};
  bigrams.forEach((bg) => {
    bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
  });
  const bigramEntries = Object.entries(bigramFreq).map(([text, count]) => ({
    text,
    size: count,
  }));

  const bcWidth = window.innerWidth * 0.45 - 60,
    bcHeight = 500;

  d3.select("#bigram-cloud").append("h3").text("Bigram Cloud");

  d3.layout
    .cloud()
    .size([bcWidth, bcHeight])
    .words(bigramEntries)
    .padding(5)
    .rotate(() => (Math.random() < 0.5 ? 0 : 90))
    .font("Impact")
    .fontSize((d) => 10 + d.size)
    .on("end", drawBigramCloud)
    .start();

  function drawBigramCloud(words) {
    d3.select("#bigram-cloud")
      .append("svg")
      .attr("width", bcWidth)
      .attr("height", bcHeight)
      .append("g")
      .attr("transform", `translate(${bcWidth / 2},${bcHeight / 2})`)
      .selectAll("text")
      .data(words)
      .enter()
      .append("text")
      .style("font-size", (d) => d.size + "px")
      .style("font-family", "Impact")
      .style("fill", () => d3.schemeCategory10[Math.floor(Math.random() * 10)])
      .attr("text-anchor", "middle")
      .attr("transform", (d) => `translate(${d.x},${d.y})rotate(${d.rotate})`)
      .text((d) => d.text);
  }

  let allTextTrigram = data
    .map((d) => d.text)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ");

  const wordsArrayTrigram = allTextTrigram
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const trigrams = [];
  for (let i = 0; i < wordsArrayTrigram.length - 2; i++) {
    trigrams.push(
      wordsArrayTrigram[i] +
        " " +
        wordsArrayTrigram[i + 1] +
        " " +
        wordsArrayTrigram[i + 2]
    );
  }

  const trigramFreq = {};
  trigrams.forEach((tg) => {
    trigramFreq[tg] = (trigramFreq[tg] || 0) + 1;
  });

  const trigramEntries = Object.entries(trigramFreq).map(([text, count]) => ({
    text,
    size: count,
  }));

  const tcWidth = window.innerWidth * 0.45 - 60,
    tcHeight = 500;

  d3.select("#trigram-cloud").append("h3").text("Trigram Cloud");

  d3.layout
    .cloud()
    .size([tcWidth, tcHeight])
    .words(trigramEntries)
    .padding(5)
    .rotate(() => (Math.random() < 0.5 ? 0 : 90))
    .font("Impact")
    .fontSize((d) => 10 + d.size)
    .on("end", drawTrigramCloud)
    .start();

  function drawTrigramCloud(words) {
    d3.select("#trigram-cloud")
      .append("svg")
      .attr("width", tcWidth)
      .attr("height", tcHeight)
      .append("g")
      .attr("transform", `translate(${tcWidth / 2},${tcHeight / 2})`)
      .selectAll("text")
      .data(words)
      .enter()
      .append("text")
      .style("font-size", (d) => d.size + "px")
      .style("font-family", "Impact")
      .style("fill", () => d3.schemeCategory10[Math.floor(Math.random() * 10)])
      .attr("text-anchor", "middle")
      .attr("transform", (d) => `translate(${d.x},${d.y})rotate(${d.rotate})`)
      .text((d) => d.text);
  }

  d3.select("#weekly-heatmap-chart")
    .append("h3")
    .text("Weekly Activity Heatmap");

  const marginW = { top: 40, right: 20, bottom: 20, left: 75 };
  const widthW = window.innerWidth * 0.45 - marginW.left - marginW.right - 66;
  const heightW = 500 - marginW.top - marginW.bottom;

  const weekdayDomain = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const weekdayCounts = {};
  weekdayDomain.forEach((day) => {
    weekdayCounts[day] = {};
  });

  data.forEach((d) => {
    const dt = new Date(d.created_at);
    const dow0 = dt.getDay();
    const nameMap = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const weekday = nameMap[dow0];
    const hour = dt.getHours();
    weekdayCounts[weekday][hour] = (weekdayCounts[weekday][hour] || 0) + 1;
  });

  const hours = d3.range(0, 24);
  const heatmapData = [];
  weekdayDomain.forEach((day) => {
    hours.forEach((hr) => {
      heatmapData.push({
        weekday: day,
        hour: hr,
        count: weekdayCounts[day][hr] || 0,
      });
    });
  });

  const maxCount = d3.max(heatmapData, (d) => d.count);

  const xW = d3.scaleBand().domain(hours).range([0, widthW]).padding(0.05);

  const yW = d3
    .scaleBand()
    .domain(weekdayDomain)
    .range([0, heightW])
    .padding(0.05);

  const colorScale = d3
    .scaleSequential(d3.interpolateBlues)
    .domain([1, maxCount]);

  const svgW = d3
    .select("#weekly-heatmap-chart")
    .append("svg")
    .attr("width", widthW + marginW.left + marginW.right)
    .attr("height", heightW + marginW.top + marginW.bottom)
    .append("g")
    .attr("transform", `translate(${66},${marginW.top})`);

  svgW
    .selectAll("rect")
    .data(heatmapData)
    .enter()
    .append("rect")
    .attr("x", (d) => xW(d.hour))
    .attr("y", (d) => yW(d.weekday))
    .attr("width", xW.bandwidth())
    .attr("height", yW.bandwidth())
    .attr("fill", (d) => (d.count > 0 ? colorScale(d.count) : "#ffffff"))
    .attr("stroke", "#ccc");

  svgW
    .append("g")
    .attr("transform", `translate(0,0)`)
    .call(d3.axisTop(xW).tickFormat((d) => `${d}:00`))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "start");

  svgW.append("g").call(d3.axisLeft(yW));

  d3.select("#hourly-posts-chart").append("h3").text("Posts Per Hour");

  const marginH = { top: 20, right: 0, bottom: 75, left: 43 };
  const chartWidthH =
    window.innerWidth * 0.45 - marginH.left - marginH.right - 75;
  const chartHeightH = 500 - marginH.top - marginH.bottom;

  const dateHourCounts = {};
  data.forEach((d) => {
    const dt = new Date(d.created_at);
    const day = dt.toISOString().slice(0, 10);
    const hr = dt.getHours().toString().padStart(2, "0");
    const key = `${day} ${hr}:00`;
    dateHourCounts[key] = (dateHourCounts[key] || 0) + 1;
  });

  const existing = Object.keys(dateHourCounts)
    .map((k) => new Date(k.replace(" ", "T")))
    .sort((a, b) => a - b);
  const minDt = existing[0];
  const maxDt = existing[existing.length - 1];

  const allHours = [];
  for (
    let t = new Date(minDt).getTime();
    t <= maxDt.getTime();
    t += 1000 * 60 * 60
  ) {
    allHours.push(new Date(t));
  }

  const hourlyDataFull = allHours.map((dt) => {
    const day = dt.toISOString().slice(0, 10);
    const hr = dt.getHours().toString().padStart(2, "0");
    const key = `${day} ${hr}:00`;
    return { dt, count: dateHourCounts[key] || 0 };
  });

  const svgH = d3
    .select("#hourly-posts-chart")
    .append("svg")
    .attr("width", chartWidthH + marginH.left + marginH.right)
    .attr("height", chartHeightH + marginH.top + marginH.bottom)
    .append("g")
    .attr("transform", `translate(${marginH.left},${marginH.top})`);

  const xH = d3.scaleTime().domain([minDt, maxDt]).range([0, chartWidthH]);

  const yH = d3
    .scaleLinear()
    .domain([0, d3.max(hourlyDataFull, (d) => d.count)])
    .nice()
    .range([chartHeightH, 0]);

  const lineGen = d3
    .line()
    .x((d) => xH(d.dt))
    .y((d) => yH(d.count));

  svgH
    .append("path")
    .datum(hourlyDataFull)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr("d", lineGen);

  svgH
    .selectAll(".dot")
    .data(hourlyDataFull)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => xH(d.dt))
    .attr("cy", (d) => yH(d.count))
    .attr("r", 3)
    .attr("fill", "steelblue");

  const totalHours = hourlyDataFull.length;
  const tickCount = Math.min(totalHours, 10);

  svgH
    .append("g")
    .attr("transform", `translate(0,${chartHeightH})`)
    .call(
      d3
        .axisBottom(xH)
        .ticks(tickCount)
        .tickFormat(d3.timeFormat("%m-%d %H:%M"))
    )
    .selectAll("text")
    .attr("transform", "rotate(-65)")
    .style("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("dy", "0.5em");

  svgH.append("g").call(d3.axisLeft(yH));

  const metricNames = ["replyCount", "repostCount", "likeCount", "quoteCount"];
  const rawByHour = {};

  data.forEach((d) => {
    const dt = new Date(d.created_at);
    const day = dt.toISOString().slice(0, 10);
    const hr = dt.getHours().toString().padStart(2, "0");
    const key = `${day} ${hr}:00`;

    if (!rawByHour[key]) {
      rawByHour[key] = metricNames.reduce((obj, m) => {
        obj[m] = [];
        return obj;
      }, {});
    }

    metricNames.forEach((m) => {
      rawByHour[key][m].push(d[m] || 0);
    });
  });

  const hoursValue = Object.keys(rawByHour)
    .map((k) => new Date(k.replace(" ", "T")))
    .sort((a, b) => a - b);
  const minDtValue = hoursValue[0];
  const maxDtValue = hoursValue[hoursValue.length - 1];
  const allHoursValue = [];
  for (
    let t = minDtValue.getTime();
    t <= maxDtValue.getTime();
    t += 1000 * 60 * 60
  ) {
    allHoursValue.push(new Date(t));
  }

  const hourlyAverages = allHoursValue.map((dt) => {
    const key = `${dt.toISOString().slice(0, 10)} ${dt
      .getHours()
      .toString()
      .padStart(2, "0")}:00`;
    const bucket =
      rawByHour[key] || metricNames.reduce((o, m) => ((o[m] = []), o), {});

    const avg = {};
    metricNames.forEach((m) => {
      const arr = bucket[m];
      const sum = arr.reduce((s, v) => s + v, 0);
      avg[m] = arr.length ? sum / arr.length : 0;
    });
    return { dt, ...avg };
  });

  const series = metricNames.map((m) => ({
    name: m,
    values: hourlyAverages.map((d) => ({ dt: d.dt, value: d[m] })),
  }));

  d3.select("#hourly-metrics-chart")
    .append("h3")
    .text("Average Hourly Engagements");

  const svgMulti = d3
    .select("#hourly-metrics-chart")
    .append("svg")
    .attr("width", chartWidthH + marginH.left + marginH.right)
    .attr("height", chartHeightH + marginH.top + marginH.bottom)
    .append("g")
    .attr("transform", `translate(${marginH.left},${marginH.top})`);

  const xValue = d3
    .scaleTime()
    .domain([minDtValue, maxDtValue])
    .range([0, chartWidthH]);

  const maxY = d3.max(series, (s) => d3.max(s.values, (d) => d.value));
  const yValue = d3
    .scaleLinear()
    .domain([0, maxY])
    .nice()
    .range([chartHeightH, 0]);

  const color = d3.scaleOrdinal(d3.schemeCategory10).domain(metricNames);

  const line = d3
    .line()
    .x((d) => xValue(d.dt))
    .y((d) => yValue(d.value));

  svgMulti
    .selectAll(".metric-line")
    .data(series)
    .enter()
    .append("path")
    .attr("class", "metric-line")
    .attr("fill", "none")
    .attr("stroke", (d) => color(d.name))
    .attr("stroke-width", 2)
    .attr("d", (d) => line(d.values));

  series.forEach((s) => {
    svgMulti
      .selectAll(`.dot-${s.name}`)
      .data(s.values)
      .enter()
      .append("circle")
      .attr("class", `dot dot-${s.name}`)
      .attr("cx", (d) => xValue(d.dt))
      .attr("cy", (d) => yValue(d.value))
      .attr("r", 3)
      .attr("fill", color(s.name));
  });

  svgMulti
    .append("g")
    .attr("transform", `translate(0,${chartHeightH})`)
    .call(
      d3
        .axisBottom(xValue)
        .ticks(Math.min(allHoursValue.length, 10))
        .tickFormat(d3.timeFormat("%m-%d %H:%M"))
    )
    .selectAll("text")
    .attr("transform", "rotate(-65)")
    .style("text-anchor", "end");
  svgMulti.append("g").call(d3.axisLeft(yValue));

  const spacing = 120;
  const totalWidth = spacing * series.length;
  const startX = (chartWidthH - totalWidth) / 2;

  function formatMetricName(name) {
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase());
  }

  const legend = svgMulti
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${startX}, ${chartHeightH + 66})`);

  series.forEach((s, i) => {
    const item = legend
      .append("g")
      .attr("transform", `translate(${i * spacing}, 0)`);

    item
      .append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", color(s.name));

    item
      .append("text")
      .attr("x", 15)
      .attr("y", 10)
      .text(formatMetricName(s.name))
      .style("font-size", "12px")
      .style("alignment-baseline", "hanging");
  });

  const container = d3.select("#card-grid");
  data.forEach((post) => {
    const card = container
      .append("div")
      .attr("class", "card")
      .attr("data-likes", post.likeCount)
      .attr("data-replies", post.replyCount)
      .attr("data-reposts", post.repostCount)
      .attr("data-quotes", post.quoteCount);

    const textBlock = card.append("div");

    const topRow = textBlock
      .append("div")
      .attr("class", "top-of-card")
      .style("display", "flex")
      .style("align-items", "flex-start")
      .style("gap", "1rem")
      .style("margin-bottom", "0.5rem");

    topRow
      .append("img")
      .attr("src", post.author_avatar)
      .attr("alt", "Avatar")
      .style("width", "66px")
      .style("height", "66px")
      .style("border-radius", "50%")
      .style("border", "1px solid black")
      .style("object-fit", "cover");

    const authorInfo = topRow
      .append("div")
      .style("display", "flex")
      .style("flex-direction", "column");

    authorInfo
      .append("p")
      .html(
        `<strong class="meta">Display Name:</strong> <span class="meta-text">${
          post.author_display_name || "N/A"
        }</span>`
      );

    authorInfo
      .append("p")
      .html(
        `<strong class="meta">Handle:</strong> <span class="meta-text">${post.author}</span>`
      );

    const buttonGroup = authorInfo
      .append("div")
      .attr("class", "button-group")
      .style("display", "flex")
      .style("gap", "10px")
      .style("margin-top", "0.3rem")
      .style("flex-wrap", "wrap");

    if (post.post_url) {
      buttonGroup
        .append("button")
        .attr("class", "view-button")
        .text("View")
        .on("click", () => {
          window.open(post.post_url, "_blank");
        });
    }

    if (post.author_did) {
      const followButton = buttonGroup
        .append("button")
        .attr("class", "follow-button")
        .text("Follow");

      let followed = false;
      let followUri = null;

      followButton.on("click", () => {
        if (!followed) {
          fetch("/follow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ did: post.author_did }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                followUri = data.data?.uri || null;
                followed = true;
                followButton.text("Unfollow");
              } else {
                alert(`Failed to follow: ${data.error}`);
              }
            })
            .catch(() => alert("Follow request failed."));
        } else {
          if (!followUri) {
            alert("Missing follow URI. Cannot unfollow.");
            return;
          }

          fetch("/unfollow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: followUri }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                followed = false;
                followUri = null;
                followButton.text("Follow");
              } else {
                alert(`Failed to unfollow: ${data.error}`);
              }
            })
            .catch(() => alert("Unfollow request failed."));
        }
      });
    }

    if (post.uri && post.cid) {
      const likeButton = buttonGroup
        .append("button")
        .attr("class", "like-button")
        .text("Like");

      let liked = false;
      let likeUri = null;

      likeButton.on("click", () => {
        if (!liked) {
          fetch("/like", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: post.uri, cid: post.cid }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                likeUri = data.data?.uri || null;
                liked = true;
                likeButton.text("Unlike");
              } else {
                alert(`Failed to like: ${data.error}`);
              }
            })
            .catch(() => alert("Like request failed."));
        } else {
          if (!likeUri) {
            alert("Missing like URI. Cannot unlike.");
            return;
          }

          fetch("/unlike", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: likeUri }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                liked = false;
                likeUri = null;
                likeButton.text("Like");
              } else {
                alert(`Failed to unlike: ${data.error}`);
              }
            })
            .catch(() => alert("Unlike request failed."));
        }
      });

      const repostButton = buttonGroup
        .append("button")
        .attr("class", "repost-button")
        .text("Repost");

      let reposted = false;
      let repostUri = null;

      repostButton.on("click", () => {
        if (!reposted) {
          fetch("/repost", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: post.uri, cid: post.cid }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                repostUri = data.data?.uri || null;
                reposted = true;
                repostButton.text("Unrepost");
              } else {
                alert(`Failed to repost: ${data.error}`);
              }
            })
            .catch(() => alert("Repost request failed."));
        } else {
          if (!repostUri) {
            alert("Missing repost URI. Cannot unrepost.");
            return;
          }

          fetch("/unrepost", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: repostUri }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                reposted = false;
                repostUri = null;
                repostButton.text("Repost");
              } else {
                alert(`Failed to unrepost: ${data.error}`);
              }
            })
            .catch(() => alert("Unrepost request failed."));
        }
      });
    }

    textBlock.append("div").html(`<strong>Post Content:</strong><br>
        <span class="content-text">${post.text}</span>`);

    if (post.links && post.links.length) {
      const linkList = post.links
        .map((url) => `<li><a href="${url}" target="_blank">${url}</a></li>`)
        .join("");
      card.append("div").attr("class", "meta").html(`
        <strong class="meta">Detected Links:</strong>
        <ul style="margin: 0.5rem 0 0 0;">
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

    if (post.uri && post.uri.startsWith("at://")) {
      const isInThread = post.reply_to || post.replyCount > 0;

      const toggleButtonGroup = card
        .append("div")
        .attr("class", "thread-reply-button-group");

      const sharedToggleContainer = card
        .append("div")
        .attr("class", "shared-toggle-container")
        .style("display", "none");

      if (isInThread) {
        toggleButtonGroup
          .append("button")
          .text("Display Thread")
          .attr("class", "toggle-thread-button shared-toggle-button")
          .on("click", () => {
            sharedToggleContainer
              .attr("class", "shared-toggle-container")
              .style("display", "block")
              .html("Loading...");

            fetch("/get_thread", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uri: post.uri }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.success && data.thread?.thread) {
                  const root = data.thread.thread;
                  sharedToggleContainer.html("");
                  renderThreadNode(root, sharedToggleContainer);
                } else {
                  sharedToggleContainer.html("Error loading thread.");
                }
              })
              .catch(() => {
                sharedToggleContainer.html("Error loading thread.");
              });
          });
      }

      if (post.cid) {
        toggleButtonGroup
          .append("button")
          .text("Reply to Post")
          .attr("class", "toggle-reply-button shared-toggle-button")
          .on("click", () => {
            sharedToggleContainer
              .attr("class", "shared-toggle-container no-border")
              .style("display", "block")
              .html("");

            const replyTextarea = sharedToggleContainer
              .append("textarea")
              .attr("placeholder", "Write your reply...")
              .style("width", "100%")
              .style("min-height", "123px")
              .style("margin-bottom", "0.5rem")
              .style("min-width", "366px")
              .style("box-sizing", "border-box")
              .style("max-width", "366px");

            sharedToggleContainer
              .append("button")
              .text("Submit Reply")
              .attr("class", "submit-reply-button shared-toggle-button")
              .on("click", () => {
                const replyText = replyTextarea.node().value.trim();
                if (!replyText) return;

                fetch("/reply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    text: replyText,
                    parent_uri: post.uri,
                  }),
                })
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.success) {
                      alert("Reply posted!");
                      replyTextarea.node().value = "";
                      sharedToggleContainer.style("display", "none");
                    } else {
                      alert("Reply failed: " + data.error);
                    }
                  })
                  .catch(() => {
                    alert("Reply submission failed.");
                  });
              });
          });
      }
    }

    const metaBlock = card.append("div").attr("class", "meta");
    metaBlock
      .append("div")
      .attr("class", "text-label")
      .html(`<strong>Meta:</strong>`);

    const date = new Date(post.created_at);
    const localString = date.toLocaleString();

    metaBlock.append("div").attr("class", "meta").html(`
      <strong class="meta">Time:</strong> <span class="meta-text">${localString}</span><br>
      <strong class="meta">Languages:</strong> <span class="meta-text">${
        post.langs?.join(", ") || "N/A"
      }</span><br>
      <span>
        <strong class="meta">Replies:</strong>  <span class="meta-text">${
          post.replyCount
        }</span>, 
        <strong class="meta">Reposts:</strong>  <span class="meta-text">${
          post.repostCount
        }</span>, 
        <strong class="meta">Likes:</strong>  <span class="meta-text">${
          post.likeCount
        }</span>, 
        <strong class="meta">Quotes:</strong>  <span class="meta-text">${
          post.quoteCount
        }</span>
      </span>
    `);

    const analysisBlock = card.append("div").attr("class", "analysis");
    analysisBlock
      .append("div")
      .attr("class", "text-label")
      .html(`<strong>Analysis:</strong>`);

    analysisBlock.append("div").attr("class", "analysis-details").html(`
      <strong class="analysis">Sentiment Score:</strong>
        <span class="analysis-text">${post.sentiment.toFixed(2)}</span><br>
      <strong class="analysis">Subjectivity:</strong>
        <span class="analysis-text">${post.subjectivity.toFixed(2)}</span><br>
      <strong class="analysis">Words:</strong>
        <span class="analysis-text">${post.word_count}</span>,
      <strong class="analysis">Sentences:</strong>
        <span class="analysis-text">${post.sentence_count}</span><br>
      <strong class="analysis">Avg. Word Length:</strong>
        <span class="analysis-text">${post.avg_word_length.toFixed(
          2
        )}</span><br>
      <strong class="analysis">Avg. Sentence Length:</strong>
        <span class="analysis-text">${post.avg_sentence_length.toFixed(
          2
        )}</span><br>
      ${
        post.noun_phrases && post.noun_phrases.length
          ? `<strong class="analysis">Noun Phrases:</strong>
            <span class="analysis-text">${post.noun_phrases.join(
              ", "
            )}</span><br>`
          : ``
      }
    `);
  });

  const likesInput = document.getElementById("likes-filter");
  const repliesInput = document.getElementById("replies-filter");
  const repostsInput = document.getElementById("reposts-filter");
  const quotesInput = document.getElementById("quotes-filter");
  const contentInput = document.getElementById("content-filter");

  function applyFilters() {
    const minLikes = parseInt(likesInput.value, 10) || 0;
    const minReplies = parseInt(repliesInput.value, 10) || 0;
    const minReposts = parseInt(repostsInput.value, 10) || 0;
    const minQuotes = parseInt(quotesInput.value, 10) || 0;
    const contentQuery = contentInput.value.toLowerCase();

    document.querySelectorAll("#card-grid .card").forEach((cardEl) => {
      const likes = parseInt(cardEl.getAttribute("data-likes"), 10) || 0;
      const replies = parseInt(cardEl.getAttribute("data-replies"), 10) || 0;
      const reposts = parseInt(cardEl.getAttribute("data-reposts"), 10) || 0;
      const quotes = parseInt(cardEl.getAttribute("data-quotes"), 10) || 0;
      const content =
        cardEl.querySelector(".content-text")?.innerText.toLowerCase() || "";

      const passesFilters =
        likes >= minLikes &&
        replies >= minReplies &&
        reposts >= minReposts &&
        quotes >= minQuotes &&
        content.includes(contentQuery);

      cardEl.style.display = passesFilters ? "" : "none";
    });
  }

  [likesInput, repliesInput, repostsInput, quotesInput, contentInput].forEach(
    (el) => el.addEventListener("input", applyFilters)
  );

  function renderThreadNode(node, container) {
    const threadChain = [];

    let current = node;
    while (current && current.post) {
      threadChain.unshift(current);
      current = current.parent;
    }

    let lastRendered = container;
    threadChain.forEach((nodePart) => {
      const postData = nodePart.post;
      const author =
        postData.author.displayName || postData.author.handle || "Unknown";
      const text = postData.record.text || "";
      const createdAt = postData.record.createdAt || "";
      const postUrl = `https://bsky.app/profile/${
        postData.author.handle
      }/post/${postData.uri.split("/").pop()}`;

      const postDiv = lastRendered
        .append("div")
        .attr("class", "thread-post")
        .style("margin-bottom", "0.75rem");

      postDiv.html(`
      <div style="margin-bottom: 0.25rem;">
        <span style="font-size: 13px;"><strong>${author}</strong></span> 
        <a href="${postUrl}" target="_blank" style="font-size: 13px;">(view)</a><br>
        <span style="font-size: 13px; color: #555;">${new Date(
          createdAt
        ).toLocaleString()}</span>
      </div>
      <div style="background: #f9f9f9; padding: 0.5rem; border-radius: 6px;">
        ${text}
      </div>
    `);

      lastRendered = postDiv;
    });

    function renderReplies(replies, parentEl) {
      if (!Array.isArray(replies) || replies.length === 0) return;

      replies.forEach((replyNode) => {
        if (!replyNode.post) return;

        const postData = replyNode.post;
        const author =
          postData.author.displayName || postData.author.handle || "Unknown";
        const text = postData.record.text || "";
        const createdAt = postData.record.createdAt || "";
        const postUrl = `https://bsky.app/profile/${
          postData.author.handle
        }/post/${postData.uri.split("/").pop()}`;

        const replyDiv = parentEl
          .append("div")
          .attr("class", "thread-reply")
          .style("margin-top", "1rem")
          .style("border-left", "3px solid #ddd")
          .style("margin-left", "1rem")
          .style("padding-left", "1rem");

        replyDiv.html(`
        <div style="margin-bottom: 0.25rem;">
          <span style="font-size: 13px;"><strong>${author}</strong></span> 
          <a href="${postUrl}" target="_blank" style="font-size: 13px;">(view)</a><br>
          <span style="font-size: 13px; color: #555;">${new Date(
            createdAt
          ).toLocaleString()}</span>
        </div>
        <div style="background: #f9f9f9; padding: 0.5rem; border-radius: 6px;">
          ${text}
        </div>
      `);

        if (replyNode.replies?.length) {
          renderReplies(replyNode.replies, replyDiv);
        }
      });
    }

    if (node.replies?.length) {
      renderReplies(node.replies, lastRendered);
    }
  }
}
