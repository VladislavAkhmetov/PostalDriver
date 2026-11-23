import { Vector3 } from 'three';

/** Fit the narrow principal axis before scaling an obliquely generated wheel. */
export function wheelFrame(points) {
  const center=[0,1,2].map(a=>points.reduce((s,p)=>s+p[a],0)/points.length);
  const c=Array.from({length:3},(_,a)=>[0,1,2].map(b=>points.reduce((s,p)=>s+(p[a]-center[a])*(p[b]-center[b]),0)/points.length));
  const v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let t=0;t<30;t++) {
    let i=0,j=1;
    for(const [a,b]of [[0,2],[1,2]])if(Math.abs(c[a][b])>Math.abs(c[i][j]))[i,j]=[a,b];
    if(Math.abs(c[i][j])<1e-12)break;
    const angle=.5*Math.atan2(2*c[i][j],c[j][j]-c[i][i]),cos=Math.cos(angle),sin=Math.sin(angle);
    for(let k=0;k<3;k++) {
      const x=c[k][i],y=c[k][j];c[k][i]=cos*x-sin*y;c[k][j]=sin*x+cos*y;
      const vx=v[k][i],vy=v[k][j];v[k][i]=cos*vx-sin*vy;v[k][j]=sin*vx+cos*vy;
    }
    for(let k=0;k<3;k++) {const x=c[i][k],y=c[j][k];c[i][k]=cos*x-sin*y;c[j][k]=sin*x+cos*y;}
  }
  const column=[0,1,2].sort((a,b)=>c[a][a]-c[b][b])[0];
  const axis=new Vector3(...v.map(row=>row[column])).normalize();
  if(axis.z<0)axis.negate();
  const up=new Vector3(0,1,0).addScaledVector(axis,-axis.y).normalize();
  const side=up.clone().cross(axis).normalize();
  return {axis,up,side,center};
}

export function straightenWheel(points) {
  const frame=wheelFrame(points),center=new Vector3(...frame.center);
  return {axis:frame.axis.toArray(),points:points.map(p=>{
    const v=new Vector3(...p).sub(center);
    return [v.dot(frame.side),v.dot(frame.up),v.dot(frame.axis)];
  })};
}
