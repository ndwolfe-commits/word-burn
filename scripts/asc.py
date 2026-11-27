#!/usr/bin/env python3
"""Ask App Store Connect two things before an upload, using the API key in the environment (never printed):
   1. the team ID, read from the app's bundle ID, which is registered here if Apple does not have it yet;
   2. whether the app has been created in App Store Connect, which only a person can do on the website.
Prints the team ID on the last line. Exits 3 with plain instructions if the app has not been created yet."""
import json, os, sys, time, urllib.request, urllib.error
import jwt  # pyjwt, with cryptography

BUNDLE, NAME = sys.argv[1], sys.argv[2]
token = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 900, "aud": "appstoreconnect-v1"},
                   os.environ["ASC_KEY_P8"], algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"]})

def call(path, body=None):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit("App Store Connect said no (%s) to %s: %s" % (e.code, path.split("?")[0], e.read().decode()[:600]))

ids = [b for b in call("/v1/bundleIds?filter[identifier]=" + BUNDLE + "&limit=200")["data"] if b["attributes"]["identifier"] == BUNDLE]
if ids: bundle = ids[0]; print("Bundle ID already registered:", BUNDLE, file=sys.stderr)
else:
    bundle = call("/v1/bundleIds", {"data": {"type": "bundleIds", "attributes": {"identifier": BUNDLE, "name": NAME, "platform": "IOS"}}})["data"]
    print("Registered the bundle ID:", BUNDLE, file=sys.stderr)
team = bundle["attributes"]["seedId"]
apps = call("/v1/apps?filter[bundleId]=" + BUNDLE)["data"]
if not apps:
    print("\nThe app has not been created in App Store Connect yet. On appstoreconnect.apple.com: Apps, the + button, New App,\n"
          "platform iOS, bundle ID " + BUNDLE + ". Then run this workflow again.", file=sys.stderr)
    print(team); sys.exit(3)
print("App found in App Store Connect:", apps[0]["attributes"]["name"], file=sys.stderr)
print(team)
