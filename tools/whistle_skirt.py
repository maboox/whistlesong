# Breath-noise "skirt" around the pitch (dB vs tone at 1-3/3-6/6-12/12-25 % offset). Usage: python3 -I tools/whistle_skirt.py file.wav[@start:end] ...
import numpy as np, wave, sys
def load(p):
    w=wave.open(p); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
    if w.getnchannels()==2: x=x.reshape(-1,2).mean(1)
    return x,sr
for spec in sys.argv[1:]:
    p,*r=spec.split("@"); x,sr=load(p)
    if r: a,b=map(float,r[0].split(":")); x=x[int(a*sr):int(b*sr)]
    N=8192;hop=N//4;win=np.hanning(N);fq=np.fft.rfftfreq(N,1/sr);res={k:[] for k in ["1-3%","3-6%","6-12%","12-25%"]}
    Ls=[]
    for i in range(0,len(x)-N,hop):
        sp=np.abs(np.fft.rfft(x[i:i+N]*win))**2;m=(fq>400)&(fq<3500);k=np.argmax(np.where(m,sp,0));f=fq[k]
        tone=sp[k-3:k+4].sum(); Ls.append(10*np.log10(tone+1e-20))
        for name,(lo,hi) in {"1-3%":(0.01,0.03),"3-6%":(0.03,0.06),"6-12%":(0.06,0.12),"12-25%":(0.12,0.25)}.items():
            e=((np.abs(fq-f)/f)>=lo)&((np.abs(fq-f)/f)<hi)
            res[name].append(10*np.log10(sp[e].sum()/tone+1e-20))
    Ls=np.array(Ls); keep=Ls>Ls.max()-10
    print(f"{(p.split('/')[-1]+(r[0] if r else ''))[-30:]:30s} "+" ".join(f"{k}:{np.median(np.array(v)[keep]):6.1f}" for k,v in res.items()))
