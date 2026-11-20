# Per-note pitch drift, vibrato, noise-by-band and attack of a whistle WAV. Needs numpy.
# Usage: python3 -I tools/whistle_notes.py file.wav
import numpy as np, wave, sys
w=wave.open(sys.argv[1]); sr=w.getframerate()
x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
N=2048; hop=220; win=np.hanning(N); fr_f=np.fft.rfftfreq(N,1/sr)
T=[];F=[];L=[];SP=[]
for i in range(0,len(x)-N,hop):
    sp=np.abs(np.fft.rfft(x[i:i+N]*win))**2
    m=(fr_f>500)&(fr_f<2000); k=np.argmax(np.where(m,sp,0))
    a,b,c=np.log(sp[k-1]+1e-20),np.log(sp[k]+1e-20),np.log(sp[k+1]+1e-20)
    d=0.5*(a-c)/(a-2*b+c); F.append((k+d)*sr/N); L.append(10*np.log10(sp[k-1:k+2].sum()+1e-20)); T.append((i+N/2)/sr); SP.append(sp)
T=np.array(T);F=np.array(F);L=np.array(L);L-=L.max();SP=np.array(SP)
cents=1200*np.log2(F/440)
on=L>-18
# segments
segs=[];s=None
for i,v in enumerate(on):
    if v and s is None: s=i
    if (not v) and s is not None:
        if i-s>=8: segs.append((s,i))
        s=None
print("notes found:",len(segs))
rates=[];depths=[]
for (a,b) in segs:
    seg=cents[a:b]; tt=T[a:b]; lv=L[a:b]
    dur=tt[-1]-tt[0]
    # trend
    p=np.polyfit(tt-tt[0],seg,1); res=seg-np.polyval(p,tt-tt[0])
    fs=1/(hop/sr); sp=np.abs(np.fft.rfft(res*np.hanning(len(res)),n=256)); fq=np.fft.rfftfreq(256,1/fs)
    mk=(fq>3)&(fq<9); vr=fq[mk][np.argmax(sp[mk])] if dur>0.4 else float('nan')
    print(f"t={tt[0]:.2f} dur={dur:.2f}s pitch start->end {seg[:3].mean()-seg[-3:].mean():+.0f}c(neg=rises) first60ms {seg[0]-seg[min(6,len(seg)-1)]:+.0f}c slope {p[0]:+.0f}c/s resid_std {res.std():.1f}c vib~{vr:.1f}Hz lvl_range {lv.min():.0f}..{lv.max():.0f}dB")
    if dur>0.4: rates.append(vr); depths.append(res.std()*1.414)
print("vib rate median",np.nanmedian(rates),"depth(peak cents) median",np.median(depths))
# noise shape: average spectrum of loud frames with tone bins masked
fq=fr_f
bands=[(100,500),(500,800),(800,1500),(1500,3000),(3000,6000),(6000,12000)]
acc={b:[] for b in bands}
for i in np.where(L>-8)[0]:
    f0=F[i]; mask=np.ones_like(fq,bool)
    for h in (1,2,3): mask&=~((fq>h*f0*0.93)&(fq<h*f0*1.07))
    tone=SP[i][(fq>f0*0.97)&(fq<f0*1.03)].sum()
    for b in bands:
        e=(fq>=b[0])&(fq<b[1])&mask
        acc[b].append(10*np.log10(SP[i][e].sum()/tone+1e-20))
for b in bands: print(f"noise band {b} Hz: median {np.median(acc[b]):.1f} dB rel tone")
# level envelope shapes: attack/release times
for (a,b) in segs[:6]:
    lv=L[a:b]; pk=lv.max(); 
    ia=np.argmax(lv>pk-6); print(f"note@{T[a]:.2f}: attack to within 6dB of peak {ia*hop/sr*1000:.0f}ms; level start {lv[0]:.0f} end {lv[-1]:.0f}")
# gaps
print("gaps(s):",[round(T[segs[i+1][0]]-T[segs[i][1]],2) for i in range(len(segs)-1)])
