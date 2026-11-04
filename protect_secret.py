"""Windows CurrentUser DPAPI bridge. Secrets travel through stdin/stdout only."""
import sys, json, base64, ctypes, os
from ctypes import wintypes

class Blob(ctypes.Structure):
    _fields_=[('cbData',wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_ubyte))]

def crypt(raw,decrypt=False):
    if os.name!='nt':raise RuntimeError('Secure key storage requires Windows on this installation.')
    crypt32=ctypes.WinDLL('crypt32',use_last_error=True);kernel32=ctypes.WinDLL('kernel32',use_last_error=True)
    source=ctypes.create_string_buffer(raw);incoming=Blob(len(raw),ctypes.cast(source,ctypes.POINTER(ctypes.c_ubyte)));out=Blob()
    if decrypt:
        fn=crypt32.CryptUnprotectData
        fn.argtypes=[ctypes.POINTER(Blob),ctypes.POINTER(wintypes.LPWSTR),ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
        fn.restype=wintypes.BOOL
        ok=fn(ctypes.byref(incoming),None,None,None,None,1,ctypes.byref(out))
    else:
        fn=crypt32.CryptProtectData
        fn.argtypes=[ctypes.POINTER(Blob),wintypes.LPCWSTR,ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
        fn.restype=wintypes.BOOL
        ok=fn(ctypes.byref(incoming),'Oma Lingo OpenAI connection',None,None,None,1,ctypes.byref(out))
    if not ok:raise RuntimeError('Windows could not protect or read this connection key.')
    try:return ctypes.string_at(out.pbData,out.cbData)
    finally:
        kernel32.LocalFree.argtypes=[ctypes.c_void_p];kernel32.LocalFree.restype=ctypes.c_void_p;kernel32.LocalFree(out.pbData)

try:
    sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
    request=json.load(sys.stdin)
    if request.get('action')=='protect':value=base64.b64encode(crypt(request['value'].encode('utf-8'))).decode('ascii')
    elif request.get('action')=='unprotect':value=crypt(base64.b64decode(request['value'],validate=True),True).decode('utf-8')
    else:raise ValueError('Unknown secret-storage operation.')
    print(json.dumps({'value':value}))
except Exception:
    # Never include input, OS diagnostics, or secret-bearing exception messages.
    print(json.dumps({'error':'Secure key storage is unavailable. Restart O/L under the same Windows account or use OPENAI_API_KEY.'}));sys.exit(1)
