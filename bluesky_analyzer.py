import json
from atproto import Client
import requests
from textblob import TextBlob
from datetime import datetime, timezone
from urllib.parse import quote
from urllib.parse import urlparse
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

            author = post.get('author', {})
            author_handle = author.get('handle', '')
            author_display_name = author.get('displayName', '')
            author_avatar = author.get('avatar', '')
            author_did = author.get('did', '')
            uri = post.get('uri', '')
            cid = post.get('cid', '')
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
                    link_uri = feature.get('uri')
                    if link_uri:
                        links.append(link_uri)

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

            langs = post['record'].get('langs', [])

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
                'quoteCount':  quote_count,
                'langs': langs,
                'author_display_name': author_display_name,
                'author_avatar': author_avatar,
                'uri': uri,
                'author_did': author_did,
                'cid': cid
            })

        except Exception as e:
            print(f"Error processing post: {e}")

    with open("static/bluesky_sentiment.json", "w") as f:
        json.dump(analyzed, f, indent=4)

    return len(analyzed)

def get_post_thread(username, app_password, post_uri):
    client = Client()
    client.login(username, app_password)
    jwt_token = client._session.access_jwt
    headers = {"Authorization": f"Bearer {jwt_token}"}

    response = requests.get(
        "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
        headers=headers,
        params={"uri": post_uri}
    )
    response.raise_for_status()
    return response.json()

def follow_user(username, app_password, did_to_follow):
    client = Client()
    client.login(username, app_password)

    try:
        result = client.follow(did_to_follow)
        return {"uri": result.uri}
    except Exception as e:
        raise RuntimeError(f"Failed to follow user: {e}")
    
def unfollow_user(username, app_password, follow_uri):
    client = Client()
    client.login(username, app_password)

    try:
        client.delete_follow(follow_uri)
        return {"success": True}
    except Exception as e:
        raise RuntimeError(f"Failed to unfollow user: {e}")
    
def like_post(username, app_password, uri, cid):
    client = Client()
    client.login(username, app_password)

    try:
        result = client.like(uri=uri, cid=cid)
        return {"uri": result.uri}
    except Exception as e:
        raise RuntimeError(f"Failed to like post: {e}")

def unlike_post(username, app_password, like_uri):
    client = Client()
    client.login(username, app_password)

    try:
        client.delete_like(like_uri)
        return {"success": True}
    except Exception as e:
        raise RuntimeError(f"Failed to unlike post: {e}")

def repost_post(username, app_password, uri, cid):
    client = Client()
    client.login(username, app_password)

    try:
        result = client.repost(uri=uri, cid=cid)
        return {"uri": result.uri}
    except Exception as e:
        raise RuntimeError(f"Failed to repost: {e}")

def unrepost_post(username, app_password, repost_uri):
    client = Client()
    client.login(username, app_password)

    try:
        client.delete_repost(repost_uri)
        return {"success": True}
    except Exception as e:
        raise RuntimeError(f"Failed to unrepost: {e}")


def parse_uri(uri: str):
    parsed = urlparse(uri)

    repo = parsed.netloc 
    path_parts = parsed.path.strip("/").split("/")

    if len(path_parts) != 2:
        raise ValueError(f"Expected 2 parts in URI path, got {len(path_parts)}: {path_parts}")

    collection, rkey = path_parts

    return {
        "repo": repo,
        "collection": collection,
        "rkey": rkey,
    }

def get_reply_refs(client, parent_uri: str):
    uri_parts = parse_uri(parent_uri)

    resp = requests.get(
        "https://bsky.social/xrpc/com.atproto.repo.getRecord",
        params=uri_parts,
    )
    resp.raise_for_status()
    parent = resp.json()

    parent_reply = parent["value"].get("reply")

    if parent_reply is not None:
        root_uri = parent_reply["root"]["uri"]
        root_parts = root_uri.split("/")[2:5]

        if len(root_parts) != 3:
            raise ValueError(f"Invalid root_uri format: {root_uri}")

        root_repo, root_collection, root_rkey = root_parts

        resp = requests.get(
            "https://bsky.social/xrpc/com.atproto.repo.getRecord",
            params={
                "repo": root_repo,
                "collection": root_collection,
                "rkey": root_rkey,
            },
        )
        resp.raise_for_status()
        root = resp.json()
    else:
        root = parent

    return {
        "root": {
            "uri": root["uri"],
            "cid": root["cid"],
        },
        "parent": {
            "uri": parent["uri"],
            "cid": parent["cid"],
        },
    }

def reply_to_post(username, app_password, parent_uri, reply_text):
    client = Client()
    client.login(username, app_password)

    reply_refs = get_reply_refs(client, parent_uri)

    post = {
        "$type": "app.bsky.feed.post",
        "text": reply_text,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reply": reply_refs
    }

    resp = requests.post(
        "https://bsky.social/xrpc/com.atproto.repo.createRecord",
        headers={"Authorization": f"Bearer {client._session.access_jwt}"},
        json={
            "repo": client.me["did"],
            "collection": "app.bsky.feed.post",
            "record": post,
        },
    )
    resp.raise_for_status()
    return resp.json()