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

def run_analysis(username, app_password, query, start_date, end_date, start_hour, end_hour, limit=100):
    client = Client()
    client.login(username, app_password)

    jwt_token = client._session.access_jwt
    headers = {
        "Authorization": f"Bearer {jwt_token}"
    }

    params = {
        "q": query,
        "limit": limit
    }

    response = requests.get("https://bsky.social/xrpc/app.bsky.feed.searchPosts", headers=headers, params=params)
    if response.status_code != 200:
        raise Exception(f"Failed to fetch posts: {response.status_code} {response.text}")

    posts = response.json().get('posts', [])
    analyzed = []

    for post in posts:
        try:
            text = post['record']['text']
            sentiment = TextBlob(text).sentiment.polarity
            created_at_raw = post.get('indexedAt', '')
            created_at = datetime.fromisoformat(created_at_raw.replace('Z', '+00:00'))

            if not (start_date <= created_at <= end_date):
                continue
            if not (start_hour <= created_at.hour < end_hour):
                continue

            author_handle = post['author']['handle']
            uri = post.get('uri', '')
            reply_parent = post['record'].get('reply', {}).get('parent', {}).get('uri', None)

            post_url = f"https://bsky.app/profile/{quote(author_handle)}/post/{uri.split('/')[-1]}" if uri else None

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

            embed_record = post.get('embed', {}).get('record', {}).get('value', {})

            external_embed = post.get('embed', {}).get('external', {})

            analyzed.append({
                'text': text,
                'linked_text': linked_text,
                'author': author_handle,
                'created_at': created_at.isoformat(),
                'sentiment': sentiment,
                'reply_to': reply_parent,
                'post_url': post_url,
                'links': links,
                'images': image_urls,
                'embedded_post': embed_record,
                'external_embed': external_embed
            })

        except Exception as e:
            print(f"Error processing post: {e}")

    with open("static/bluesky_sentiment.json", "w") as f:
        json.dump(analyzed, f, indent=4)

    return len(analyzed)
