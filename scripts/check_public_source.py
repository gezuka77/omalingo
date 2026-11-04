"""Reject site configuration, private addresses and credential literals in public source."""
import ipaddress
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).decode().split('\0')
patterns = {
    'private key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'GitHub token': r'\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}',
    'provider token': r'\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}',
    'cloud access key': r'\bAKIA[A-Z0-9]{16}\b',
    'personal filesystem path': r'(?:/home/|/Users/|[A-Za-z]:[/\\]Users[/\\])[A-Za-z0-9_-]+[/\\]',
}
errors = []
for name in filter(None, paths):
    p = ROOT / name
    if name.split('/')[0] in {'homelab', 'deployment', 'data', 'credentials'} or p.name in {'.env', 'release.json'}:
        errors.append((name, 'private deployment/data file'))
        continue
    try:
        text = p.read_text(encoding='utf-8')
    except (UnicodeError, IsADirectoryError):
        continue
    for label, pattern in patterns.items():
        if re.search(pattern, text):
            errors.append((name, label))
    for match in re.findall(r'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])', text):
        try:
            address = ipaddress.ip_address(match)
        except ValueError:
            continue
        if address.is_private and not address.is_loopback and not address.is_unspecified:
            errors.append((name, 'private network address'))
if errors:
    for name, label in errors:
        print(f'{name}: {label} requires review (value omitted)')
    raise SystemExit(1)
print('Public source guard passed; values are never printed.')
