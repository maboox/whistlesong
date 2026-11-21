# Usage: python3 -I tools/whistle_micro.py file.wav[@start:end] ...
# Micro-dynamics of a whistle: complex demodulation around the tracked fundamental.
import numpy as np, wave, sys
def load(p):
    w=wave.open(p); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
    if w.getnchannels()==2: x=x.reshape(-1,2).mean(1)
    return x,sr
def coarse(x,sr,fmin=400,fmax=3500):
    N=2048;hop=int(sr*0.005);win=np.hanning(N);fq=np.fft.rfftfreq(N,1/sr);F=[];L=[]
    for i in range(0,len(x)-N,hop):
        sp=np.abs(np.fft.rfft(x[i:i+N]*win))**2;m=(fq>fmin)&(fq<fmax);k=np.argmax(np.where(m,sp,0))
        a,b,c=np.log(sp[k-1]+1e-20),np.log(sp[k]+1e-20),np.log(sp[k+1]+1e-20);den=a-2*b+c;d=0.5*(a-c)/den if den!=0 else 0
        F.append((k+d)*sr/N);L.append(10*np.log10(sp[k-2:k+3].sum()+1e-20))
    t=(np.arange(len(F))*hop+N/2)/sr
    return t,np.array(F),np.array(L)
def lp(z,sr,fc):
    # FFT brickwall-ish low pass with smooth edge
    Z=np.fft.fft(z);f=np.fft.fftfreq(len(z),1/sr);g=1/(1+(np.abs(f)/fc)**8);return np.fft.ifft(Z*g)
def analyze(x,sr,label):
    t,F,L=coarse(x,sr); L-=L.max()
    v=L>-20
    # smooth coarse f0 (median 5) and interpolate per sample
    Fs=F.copy()
    for i in range(2,len(F)-2): Fs[i]=np.median(F[i-2:i+3])
    n=np.arange(len(x))/sr
    f_ref=np.interp(n,t,Fs); ph=2*np.pi*np.cumsum(f_ref)/sr
    z=lp(x*np.exp(-1j*ph),sr,250)
    amp=np.abs(z); dph=np.diff(np.unwrap(np.angle(z)))*sr/(2*np.pi)  # Hz deviation
    inst=f_ref[1:]+dph
    # decimate to 1 kHz
    d=sr//1000; amp_d=amp[::d][:-1]; inst_d=inst[::d]; m=min(len(amp_d),len(inst_d)); amp_d=amp_d[:m]; inst_d=inst_d[:m]
    vt=np.interp(np.arange(m)/1000,t,v.astype(float))>0.99
    cents=1200*np.log2(np.maximum(inst_d,50)/440); adb=20*np.log10(amp_d+1e-9)
    # take voiced runs > 0.3 s, trim 60ms at both ends
    idx=np.where(vt)[0]; runs=np.split(idx,np.where(np.diff(idx)>1)[0]+1); runs=[r[60:-60] for r in runs if len(r)>300]
    if not runs: print(label,"no runs"); return
    def bandrms(sig,lo,hi):
        out=[]
        for r in runs:
            s=sig[r]-sig[r].mean(); S=np.fft.rfft(s*np.hanning(len(s))); f=np.fft.rfftfreq(len(s),1/1000)
            e=(f>=lo)&(f<hi); out.append(np.sqrt((np.abs(S[e])**2).sum()*2/(np.hanning(len(s))**2).sum()/len(s)))
        return np.median(out)
    bands=[(0.5,4),(4,8),(8,16),(16,32),(32,64),(64,128),(128,250)]
    pc=" ".join(f"{bandrms(cents,a,b):5.1f}" for a,b in bands)
    ac=" ".join(f"{bandrms(adb,a,b):5.2f}" for a,b in bands)
    # correlation between fast pitch and amp (8-64 Hz)
    cs=[]
    for r in runs:
        a_=adb[r]-np.convolve(adb[r],np.ones(60)/60,'same'); c_=cents[r]-np.convolve(cents[r],np.ones(60)/60,'same')
        cs.append(np.corrcoef(a_[60:-60],c_[60:-60])[0,1] if len(r)>200 else np.nan)
    print(f"{label:28s} runs {len(runs):3d} | pitch rms cents per band {pc} | amp rms dB per band {ac} | corr(amp,pitch fast) {np.nanmedian(cs):+.2f}")
if __name__=="__main__":
    print("bands Hz: 0.5-4 4-8 8-16 16-32 32-64 64-128 128-250")
    for spec in sys.argv[1:]:
        p,*rng=spec.split("@"); x,sr=load(p)
        if rng: a,b=map(float,rng[0].split(":")); x=x[int(a*sr):int(b*sr)]
        analyze(x,sr,(p.split("/")[-1]+("@"+rng[0] if rng else ""))[-28:])
