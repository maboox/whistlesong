# Usage: python3 -I tools/whistle_articulation.py file.wav[@start:end] ...
# Note articulation statistics of whistle recordings: onsets, endings, transitions.
import numpy as np, wave, sys
def load(p):
    w=wave.open(p); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
    if w.getnchannels()==2: x=x.reshape(-1,2).mean(1)
    return x,sr
def track(x,sr):
    N=2048;hop=int(sr*0.01);win=np.hanning(N);fq=np.fft.rfftfreq(N,1/sr);F=[];L=[]
    for i in range(0,len(x)-N,hop):
        sp=np.abs(np.fft.rfft(x[i:i+N]*win))**2;m=(fq>400)&(fq<3500);k=np.argmax(np.where(m,sp,0))
        a,b,c=np.log(sp[k-1]+1e-20),np.log(sp[k]+1e-20),np.log(sp[k+1]+1e-20);den=a-2*b+c;d=0.5*(a-c)/den if den!=0 else 0
        F.append((k+d)*sr/N);L.append(10*np.log10(sp[k-2:k+3].sum()+1e-20))
    return np.array(F),np.array(L)
def run(p,rng=None):
    x,sr=load(p)
    if rng: x=x[int(rng[0]*sr):int(rng[1]*sr)]
    F,L=track(x,sr); L=L-np.percentile(L,99); C=1200*np.log2(np.maximum(F,1)/440)
    v=L>-22
    # stable plateaus: >=80ms where pitch within +-35c of running median
    notes=[]; i=0; n=len(C)
    while i<n:
        if not v[i]: i+=1; continue
        j=i
        while j<n and v[j] and abs(C[j]-np.median(C[i:j+1]))<35: j+=1
        if j-i>=8: notes.append((i,j,np.median(C[i:j])))
        i=max(j,i+1)
    # transitions between consecutive plateaus
    trans={"slur":0,"dip":0,"gap":0}; gaps=[]; falls=[]; scoops=[]; glide_t=[]
    for k in range(len(notes)-1):
        a=notes[k]; b=notes[k+1]; mid=range(a[1],b[0])
        if len(mid)==0 or all(v[m] for m in mid):
            lv=min([L[m] for m in mid]) if len(mid) else min(L[a[1]-1],L[b[0]])
            peak=max(L[a[0]:a[1]].max(),L[b[0]:b[1]].max())
            if peak-lv>10: trans["dip"]+=1
            else: trans["slur"]+=1; glide_t.append(len(mid)*10)
        else:
            trans["gap"]+=1; gaps.append(len(mid)*10)
    for (s,e,c) in notes:
        # ending: voiced frames after plateau end before silence, pitch relative
        j=e; tail=[]
        while j<n and v[j] and j-e<30: tail.append(C[j]-c); j+=1
        if tail and (j>=n or not v[j]): falls.append((min(tail) if np.mean(tail)<0 else max(tail), len(tail)*10))
        j=s-1; head=[]
        while j>=0 and v[j] and s-j<30: head.append(C[j]-c); j-=1
        if head and (j<0 or not v[j]): scoops.append((head[-1],len(head)*10))
    tot=sum(trans.values()) or 1
    fa=np.array(falls) if falls else np.zeros((0,2)); sc=np.array(scoops) if scoops else np.zeros((0,2))
    big_fall=(fa[:,0]<-100).mean() if len(fa) else 0
    print(f"{(p.split('/')[-1]+(str(rng) if rng else ''))[-30:]:30s} plateaus {len(notes):3d} dur med {np.median([(e-s)*10 for s,e,_ in notes]):.0f}ms | trans slur {trans['slur']/tot:.2f} dip {trans['dip']/tot:.2f} gap {trans['gap']/tot:.2f} (gap med {np.median(gaps) if gaps else 0:.0f}ms, slur glide med {np.median(glide_t) if glide_t else 0:.0f}ms)"
          f" | ends: n={len(fa)} pitch move med {np.median(fa[:,0]) if len(fa) else 0:+.0f}c, falls>100c {big_fall:.2f}, tail {np.median(fa[:,1]) if len(fa) else 0:.0f}ms"
          f" | starts: n={len(sc)} offset med {np.median(sc[:,0]) if len(sc) else 0:+.0f}c, head {np.median(sc[:,1]) if len(sc) else 0:.0f}ms")
for spec in sys.argv[1:]:
    p,*r=spec.split("@"); run(p,tuple(map(float,r[0].split(":"))) if r else None)
