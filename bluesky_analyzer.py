import json
from atproto import Client
import requests
from textblob import TextBlob
from datetime import datetime
from urllib.parse import quote
import re

def linkify_text(text):
    return re.sub(
        r'(https?://[^\s]+)',
        r'<a href="\1" target="_blank">\1</a>',
        text
    )

def run_analysis(username, app_password, query, start_date, end_date, limit=100):
    client = Client()
    client.login(username, app_password)
    jwt_token = client._session.access_jwt
    headers = {"Authorization": f"Bearer {jwt_token}"}

    since_iso = start_date.isoformat(timespec="milliseconds").replace("+00:00","Z")
    until_iso = end_date.isoformat(timespec="milliseconds").replace("+00:00","Z")

    params = {
        "q":     query,
        "limit": limit,
        "since": since_iso,
        "until": until_iso,
    }

    response = requests.get(
        "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts",
        headers=headers,
        params=params,
    )
    response.raise_for_status()
    posts = response.json().get("posts", [])
    analyzed = []

    print(posts)

    for post in posts:
        try:
            text = post['record'].get('text', "")
            blob = TextBlob(text)

            polarity        = blob.sentiment.polarity
            subjectivity    = blob.sentiment.subjectivity
            word_count      = len(blob.words)
            sentence_count  = len(blob.sentences)
            avg_word_length = (sum(len(w) for w in blob.words) / word_count) if word_count else 0
            avg_sentence_length = (word_count / sentence_count) if sentence_count else 0
            noun_phrases    = blob.noun_phrases

            created_at_raw = post['record'].get('createdAt', post.get('indexedAt', ''))
            created_at = datetime.fromisoformat(created_at_raw.replace('Z', '+00:00')) if created_at_raw else None

            author_handle = post['author']['handle']
            uri = post.get('uri', '')
            reply_parent = post['record'].get('reply', {}).get('parent', {}).get('uri', None)

            post_url = (
                f"https://bsky.app/profile/{quote(author_handle)}/post/{uri.split('/')[-1]}"
                if uri else None
            )

            linked_text = linkify_text(text)

            facets = post['record'].get('facets', [])
            links = []
            for facet in facets:
                for feature in facet.get('features', []):
                    uri = feature.get('uri')
                    if uri:
                        links.append(uri)

            image_urls = []
            embed = post.get('embed', {})
            if 'images' in embed:
                for img in embed['images']:
                    image_urls.append(img.get('fullsize'))

            embed_record   = embed.get('record', {}).get('value', {})
            external_embed = embed.get('external', {})

            reply_count  = post.get('replyCount',  0)
            repost_count = post.get('repostCount', 0)
            like_count   = post.get('likeCount',   0)
            quote_count  = post.get('quoteCount',  0)

            analyzed.append({
                'text': text,
                'linked_text': linked_text,
                'author': author_handle,
                'created_at': created_at.isoformat() if created_at else None,

                'polarity': polarity,
                'subjectivity': subjectivity,

                'word_count': word_count,
                'sentence_count': sentence_count,
                'avg_word_length': avg_word_length,
                'avg_sentence_length': avg_sentence_length,

                'noun_phrases': noun_phrases,

                'sentiment': polarity,
                'reply_to': reply_parent,
                'post_url': post_url,
                'links': links,
                'images': image_urls,
                'embedded_post': embed_record,
                'external_embed': external_embed,

                'replyCount':  reply_count,
                'repostCount': repost_count,
                'likeCount':   like_count,
                'quoteCount':  quote_count
            })

        except Exception as e:
            print(f"Error processing post: {e}")

    with open("static/bluesky_sentiment.json", "w") as f:
        json.dump(analyzed, f, indent=4)

    return len(analyzed)
