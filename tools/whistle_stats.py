# Measure a whistle recording (WAV, mono 16-bit): pitch range, overtones, noise. Needs numpy.
# Usage: python3 -I tools/whistle_stats.py file.wav   (convert mp3 first: ffmpeg -i in.mp3 -ac 1 out.wav)
import numpy as np, wave, sys
w=wave.open(sys.argv[1]); sr=w.getframerate()
x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
print("dur",len(x)/sr,"peak",abs(x).max(),"rms dB",20*np.log10(np.sqrt((x**2).mean())))
N=4096; hop=441; win=np.hanning(N)
freqs=np.fft.rfftfreq(N,1/sr)
rows=[];f0=[];lvl=[];tonedb=[];h2=[];h3=[];noise=[];hiss=[]
for i in range(0,len(x)-N,hop):
    fr=x[i:i+N]*win; sp=np.abs(np.fft.rfft(fr))**2
    m=(freqs>300)&(freqs<4000); k=np.argmax(np.where(m,sp,0))
    # parabolic interp
    a,b,c=np.log(sp[k-1]+1e-20),np.log(sp[k]+1e-20),np.log(sp[k+1]+1e-20)
    d=0.5*(a-c)/(a-2*b+c); f=(k+d)*sr/N
    tot=sp[1:].sum(); e=(freqs>f*0.97)&(freqs<f*1.03)
    tp=sp[e].sum()
    e2=(freqs>2*f*0.97)&(freqs<2*f*1.03); e3=(freqs>3*f*0.97)&(freqs<3*f*1.03)
    rest=tot-tp-sp[e2].sum()-sp[e3].sum()
    hs=(freqs>3000)&(freqs<10000)
    f0.append(f); lvl.append(10*np.log10(tp+1e-20)); tonedb.append(10*np.log10(tp/tot+1e-20))
    h2.append(10*np.log10(sp[e2].sum()/tp+1e-20)); h3.append(10*np.log10(sp[e3].sum()/tp+1e-20))
    noise.append(10*np.log10(rest/tp+1e-20)); hiss.append(10*np.log10(sp[hs].sum()/tp+1e-20))
f0=np.array(f0); lvl=np.array(lvl); t=np.arange(len(f0))*hop/sr
np.save(sys.argv[1]+".f0.npy",np.vstack([t,f0,lvl]))
voiced=lvl>lvl.max()-30
print("voiced frames",voiced.sum(),"of",len(f0))
print("f0 range Hz (voiced) min/median/max",f0[voiced].min(),np.median(f0[voiced]),f0[voiced].max())
for name,a in (("h2 dB rel f0",h2),("h3 dB rel f0",h3),("noise(non-harm) dB rel f0",noise),("hiss 3-10k dB rel f0",hiss)):
    a=np.array(a)[voiced]; print(name,"median",round(np.median(a),1),"p10",round(np.percentile(a,10),1),"p90",round(np.percentile(a,90),1))
# print pitch track compressed
print("t  f0Hz  midi  lvl")
for i in range(0,len(f0),5):
    if voiced[i]: print(round(t[i],2), round(f0[i]), round(69+12*np.log2(f0[i]/440),2), round(lvl[i]-lvl.max(),1))
