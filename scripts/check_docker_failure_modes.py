"""Exercise missing/corrupt data failures in disposable containers, never in /data."""
import subprocess


def main():
    preparation = subprocess.run([
        "docker", "compose", "run", "--rm", "--no-deps", "-T", "data-init",
        "python", "-m", "spherex.prepare", "--offline", "--output", "/tmp/empty-m101",
    ], capture_output=True, text=True)
    assert preparation.returncode == 2, preparation.stdout + preparation.stderr
    assert "blocked" in preparation.stdout, preparation.stdout
    print("PASS data-init: offline + empty cache exits 2, no synthetic replacement")
    code = '''
import json, threading, time
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError, URLError
import uvicorn
from spherex.service import verify_dataset_usability
bad=Path('/tmp/invalid-m101');bad.mkdir()
(bad/'aligned.fits').write_bytes(b'not a FITS product')
(bad/'manifest.json').write_text(json.dumps({'status':'visualization_pair_validated','comparison':{'observations':[{},{}]}}))
assert verify_dataset_usability(bad)[0] is False
server=uvicorn.Server(uvicorn.Config('spherex.api:app',host='127.0.0.1',port=8765,log_level='error'))
thread=threading.Thread(target=server.run,daemon=True);thread.start()
for _ in range(100):
 try:
  health=json.load(urlopen('http://127.0.0.1:8765/health',timeout=2));break
 except URLError: time.sleep(.1)
else: raise AssertionError('API did not start')
assert health['m101_cached'] is False,health
try:
 urlopen('http://127.0.0.1:8765/frames?ra=210.80227&dec=54.34895&fov=3',timeout=10)
 raise AssertionError('missing dataset succeeded')
except HTTPError as exc:
 assert exc.code==503,exc.code
 assert json.load(exc)['error_type']=='data_unavailable'
server.should_exit=True;thread.join(5)
print('PASS backend: invalid FITS rejected, missing data health=false and HTTP 503')
'''
    subprocess.run([
        "docker", "compose", "run", "--rm", "--no-deps", "-T",
        "-e", "SPHEREX_DATA_DIR=/tmp/empty-m101", "backend", "python", "-c", code,
    ], check=True)


if __name__ == "__main__":
    main()
