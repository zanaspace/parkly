  env:
    GITHUB_TOKEN: ***
(node:2385) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
(node:2385) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
[zanaspace] is an individual user. No license key is required.
gitleaks version: 8.24.3
Version to install: 8.24.3 (target directory: /tmp/gitleaks-8.24.3)
Cache hit for: gitleaks-cache-8.24.3-linux-x64
Received 5717485 of 5717485 (100.0%), 6.1 MBs/sec
Cache Size: ~5 MB (5717485 B)
/usr/bin/tar -xf /home/runner/work/_temp/4b2ae502-a2c1-4129-8309-7fe7e9ca9dce/cache.tzst -P -C /home/runner/work/parkly/parkly --use-compress-program unzstd
Cache restored successfully
Gitleaks restored from cache
event type: push
gitleaks cmd: gitleaks detect --redact -v --exit-code=2 --report-format=sarif --report-path=results.sarif --log-level=debug --log-opts=-1
/tmp/gitleaks-8.24.3/gitleaks detect --redact -v --exit-code=2 --report-format=sarif --report-path=results.sarif --log-level=debug --log-opts=-1

    ○
    │╲
    │ ○
    ○ ░
    ░    gitleaks

10:52AM DBG using github.com/wasilibs/go-re2 regex engine
10:52AM DBG no gitleaks config found in path .gitleaks.toml, using default gitleaks config
10:52AM DBG found .gitleaksignore file: .gitleaksignore
10:52AM DBG found .gitleaksignore file: .gitleaksignore
10:52AM DBG executing: /usr/bin/git -C . log -p -U0 -1
10:52AM DBG SCM platform parsed from host host=github.com platform=github
Finding:     "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "REDACTED"
Secret:      REDACTED
RuleID:      generic-api-key
Entropy:     4.811499
File:        parkly-app/apps/mobile/eas.json
Line:        12
Commit:      d70b54e17048b461f44c44c26caa7470b70ae377
Author:      zanaspace
Email:       sellytics@gmail.com
Date:        2026-11-20T10:52:13Z
Fingerprint: d70b54e17048b461f44c44c26caa7470b70ae377:parkly-app/apps/mobile/eas.json:generic-api-key:12
Link:        https://github.com/zanaspace/parkly/blob/d70b54e17048b461f44c44c26caa7470b70ae377/parkly-app/apps/mobile/eas.json#L12

10:52AM INF 1 commits scanned.
10:52AM DBG Note: this number might be smaller than expected due to commits with no additions
10:52AM INF scanned ~210 bytes (210 bytes) in 153ms
10:52AM WRN leaks found: 1
Artifact name is valid!
Root directory input is valid!
Beginning upload of artifact content to blob storage
Uploaded bytes 7131
Finished uploading artifact content to blob storage!
SHA256 digest of uploaded artifact zip is a1ea86bb283db38a434ae214f2cf6872f624df81865d162ad4ddd5f2f2c035da
Finalizing artifact upload
Artifact gitleaks-results.sarif.zip successfully finalized. Artifact ID 14621674830
Warning: 🛑 Leaks detected, see job summary for details