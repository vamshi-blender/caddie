"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

type EOption = echarts.EChartsOption;

function useChart(option: EOption) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, "dark", { renderer: "svg" });
    chart.setOption(option);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.dispose(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-[#1a1f2e] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[.06]">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</span>
      </div>
      <div className="flex-1 p-2">{children}</div>
    </div>
  );
}

function EC({ option, h = 220 }: { option: EOption; h?: number }) {
  const ref = useChart(option);
  return <div ref={ref} style={{ width: "100%", height: h }} />;
}

// ── data ──────────────────────────────────────────────────────────────────────
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const rev =    [42,38,55,61,49,72,68,80,74,91,85,103];
const exp =    [30,28,35,40,33,48,45,52,49,58,55,67];

export default function EChartsPanel() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 1. Bar */}
      <Card title="Bar Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10}},
          yAxis:{type:"value"},
          series:[{name:"Revenue",type:"bar",data:rev,itemStyle:{color:"#7c3aed"},barMaxWidth:18}]
        }}/>
      </Card>

      {/* 2. Grouped Bar */}
      <Card title="Grouped Bar">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          legend:{top:0,textStyle:{color:"#94a3b8"},itemWidth:10},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10}},
          yAxis:{type:"value"},
          series:[
            {name:"Revenue",type:"bar",data:rev,barMaxWidth:10,itemStyle:{color:"#6366f1"}},
            {name:"Expenses",type:"bar",data:exp,barMaxWidth:10,itemStyle:{color:"#f472b6"}}
          ]
        }}/>
      </Card>

      {/* 3. Stacked Bar */}
      <Card title="Stacked Bar">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},
          legend:{top:0,textStyle:{color:"#94a3b8"},itemWidth:10},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10}},
          yAxis:{type:"value"},
          series:[
            {name:"Revenue",type:"bar",stack:"total",data:rev,itemStyle:{color:"#6366f1"}},
            {name:"Expenses",type:"bar",stack:"total",data:exp,itemStyle:{color:"#f472b6"}}
          ]
        }}/>
      </Card>

      {/* 4. Line */}
      <Card title="Line Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10}},
          yAxis:{type:"value"},
          series:[{name:"Revenue",type:"line",data:rev,smooth:true,lineStyle:{color:"#34d399",width:2.5},itemStyle:{color:"#34d399"}}]
        }}/>
      </Card>

      {/* 5. Area */}
      <Card title="Area Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10},boundaryGap:false},
          yAxis:{type:"value"},
          series:[{
            name:"Revenue",type:"line",data:rev,smooth:true,
            lineStyle:{color:"#818cf8",width:2},
            itemStyle:{color:"#818cf8"},
            areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:"rgba(129,140,248,.4)"},{offset:1,color:"rgba(129,140,248,0)"}])}
          }]
        }}/>
      </Card>

      {/* 6. Stacked Area */}
      <Card title="Stacked Area">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          legend:{top:0,textStyle:{color:"#94a3b8"},itemWidth:10},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10},boundaryGap:false},
          yAxis:{type:"value"},
          series:[
            {name:"Rev",type:"line",data:rev,smooth:true,stack:"s",areaStyle:{},lineStyle:{color:"#818cf8"},itemStyle:{color:"#818cf8"}},
            {name:"Exp",type:"line",data:exp,smooth:true,stack:"s",areaStyle:{},lineStyle:{color:"#f472b6"},itemStyle:{color:"#f472b6"}}
          ]
        }}/>
      </Card>

      {/* 7. Pie */}
      <Card title="Pie Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"item"},
          series:[{
            type:"pie",radius:"65%",center:["50%","55%"],
            data:[{value:335,name:"Direct"},{value:310,name:"Email"},{value:234,name:"Ads"},{value:135,name:"Video"},{value:148,name:"Search"}],
            label:{fontSize:11},
            emphasis:{itemStyle:{shadowBlur:10,shadowOffsetX:0,shadowColor:"rgba(0,0,0,.5)"}}
          }]
        }}/>
      </Card>

      {/* 8. Donut */}
      <Card title="Donut Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"item"},
          series:[{
            type:"pie",radius:["40%","68%"],center:["50%","55%"],
            data:[{value:335,name:"Direct"},{value:310,name:"Email"},{value:234,name:"Ads"},{value:148,name:"Search"}],
            label:{fontSize:11},avoidLabelOverlap:false,
          }]
        }}/>
      </Card>

      {/* 9. Scatter */}
      <Card title="Scatter Plot">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"item"},
          xAxis:{},yAxis:{},
          series:[{type:"scatter",symbolSize:8,
            data:Array.from({length:60},()=>[+(Math.random()*100).toFixed(1),+(Math.random()*100).toFixed(1)]),
            itemStyle:{color:"#fb923c",opacity:0.7}
          }]
        }}/>
      </Card>

      {/* 10. Bubble */}
      <Card title="Bubble Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"item"},
          xAxis:{},yAxis:{},
          series:[{type:"scatter",
            data:Array.from({length:30},()=>[+(Math.random()*100).toFixed(1),+(Math.random()*100).toFixed(1),+(Math.random()*40+5).toFixed(1)]),
            symbolSize:(d:number[])=>d[2],
            itemStyle:{color:"#38bdf8",opacity:0.6}
          }]
        }}/>
      </Card>

      {/* 11. Heatmap */}
      <Card title="Heatmap">
        <EC h={240} option={{
          backgroundColor:"transparent",
          tooltip:{position:"top"},
          grid:{top:"10%",left:"15%",right:"5%",bottom:"15%"},
          xAxis:{type:"category",data:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],splitArea:{show:true}},
          yAxis:{type:"category",data:["0h","4h","8h","12h","16h","20h"],splitArea:{show:true}},
          visualMap:{min:0,max:10,calculable:true,orient:"horizontal",left:"center",top:"0%",itemWidth:8,itemHeight:80,textStyle:{color:"#94a3b8"},inRange:{color:["#1e3a5f","#0ea5e9","#fde68a"]}},
          series:[{type:"heatmap",
            data:(()=>{const d=[];for(let i=0;i<7;i++)for(let j=0;j<6;j++)d.push([i,j,Math.round(Math.random()*10)]);return d;})(),
            label:{show:false}
          }]
        }}/>
      </Card>

      {/* 12. Radar */}
      <Card title="Radar Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{},
          radar:{indicator:[{name:"Sales",max:100},{name:"Admin",max:100},{name:"Tech",max:100},{name:"Support",max:100},{name:"Dev",max:100},{name:"Marketing",max:100}],radius:"65%"},
          series:[{type:"radar",
            data:[
              {value:[80,72,65,90,55,78],name:"Team A",areaStyle:{opacity:0.3},lineStyle:{color:"#818cf8"},itemStyle:{color:"#818cf8"}},
              {value:[60,55,80,45,70,60],name:"Team B",areaStyle:{opacity:0.3},lineStyle:{color:"#34d399"},itemStyle:{color:"#34d399"}}
            ]
          }]
        }}/>
      </Card>

      {/* 13. Candlestick */}
      <Card title="Candlestick (OHLC)">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis",axisPointer:{type:"cross"}},
          xAxis:{type:"category",data:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},
          yAxis:{scale:true},
          series:[{
            type:"candlestick",
            data:[[20,34,10,38],[40,35,30,50],[31,38,33,44],[38,15,5,42],[25,36,22,40],[28,33,20,35],[30,42,25,47]],
            itemStyle:{color:"#34d399",color0:"#f87171",borderColor:"#34d399",borderColor0:"#f87171"}
          }]
        }}/>
      </Card>

      {/* 14. Gauge */}
      <Card title="Gauge">
        <EC option={{
          backgroundColor:"transparent",
          series:[{
            type:"gauge",radius:"80%",
            progress:{show:true,width:10},
            axisLine:{lineStyle:{width:10}},
            axisTick:{show:false},
            splitLine:{length:12,lineStyle:{width:2,color:"#555"}},
            axisLabel:{distance:16,color:"#94a3b8",fontSize:10},
            anchor:{show:true,showAbove:true,size:18,itemStyle:{borderWidth:6}},
            detail:{valueAnimation:true,fontSize:22,fontWeight:"bold",color:"#f0f4ff",formatter:"{value}%",offsetCenter:[0,"70%"]},
            data:[{value:72,name:"Performance",title:{offsetCenter:[0,"95%"],color:"#94a3b8",fontSize:12}}]
          }]
        }}/>
      </Card>

      {/* 15. Funnel */}
      <Card title="Funnel Chart">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"item"},
          series:[{
            type:"funnel",left:"15%",width:"70%",
            data:[{value:100,name:"Visits"},{value:75,name:"Leads"},{value:50,name:"Trials"},{value:30,name:"Orders"},{value:15,name:"Revenue"}],
            label:{position:"inside",color:"#fff",fontSize:11},
            gap:2
          }]
        }}/>
      </Card>

      {/* 16. Sankey */}
      <Card title="Sankey Diagram">
        <EC h={240} option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"item",triggerOn:"mousemove"},
          series:[{
            type:"sankey",emphasis:{focus:"adjacency"},
            data:[{name:"A"},{name:"B"},{name:"C"},{name:"D"},{name:"E"},{name:"F"}],
            links:[{source:"A",target:"C",value:10},{source:"A",target:"D",value:6},{source:"B",target:"D",value:8},{source:"B",target:"E",value:4},{source:"C",target:"F",value:9},{source:"D",target:"F",value:12},{source:"E",target:"F",value:3}],
            lineStyle:{color:"gradient",opacity:0.4},
            label:{color:"#e2e8f0",fontSize:11}
          }]
        }}/>
      </Card>

      {/* 17. Treemap */}
      <Card title="Treemap">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{},
          series:[{
            type:"treemap",
            data:[
              {name:"Tech",value:40,children:[{name:"Frontend",value:20},{name:"Backend",value:15},{name:"Infra",value:5}]},
              {name:"Sales",value:30,children:[{name:"Enterprise",value:18},{name:"SMB",value:12}]},
              {name:"Marketing",value:20,children:[{name:"Digital",value:12},{name:"Events",value:8}]},
              {name:"HR",value:10}
            ],
            label:{show:true,fontSize:11,color:"#fff"},
            breadcrumb:{show:false}
          }]
        }}/>
      </Card>

      {/* 18. Sunburst */}
      <Card title="Sunburst">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{},
          series:[{
            type:"sunburst",radius:[0,"85%"],
            data:[
              {name:"A",value:10,children:[{name:"A1",value:4},{name:"A2",value:6}]},
              {name:"B",value:20,children:[{name:"B1",value:8},{name:"B2",value:5},{name:"B3",value:7}]},
              {name:"C",value:15,children:[{name:"C1",value:9},{name:"C2",value:6}]},
              {name:"D",value:8}
            ],
            label:{fontSize:11,color:"#e2e8f0",rotate:"tangential"},
            emphasis:{focus:"ancestor"}
          }]
        }}/>
      </Card>

      {/* 19. Parallel Coordinates */}
      <Card title="Parallel Coordinates">
        <EC h={240} option={{
          backgroundColor:"transparent",
          parallel:{left:"8%",right:"8%",bottom:"15%",top:"15%"},
          parallelAxis:[
            {dim:0,name:"Price",min:0,max:100},
            {dim:1,name:"Rating",min:0,max:10},
            {dim:2,name:"Sales",min:0,max:500},
            {dim:3,name:"Returns",min:0,max:50},
            {dim:4,name:"Margin",min:0,max:100}
          ],
          series:[{
            type:"parallel",lineStyle:{width:1.5,opacity:0.5},
            data:Array.from({length:30},()=>[
              +(Math.random()*100).toFixed(1),
              +(Math.random()*10).toFixed(1),
              +(Math.random()*500).toFixed(0),
              +(Math.random()*50).toFixed(0),
              +(Math.random()*100).toFixed(1)
            ])
          }]
        }}/>
      </Card>

      {/* 20. Waterfall */}
      <Card title="Waterfall Chart">
        <EC option={(() => {
          const base =    [0, 750,  610,  680,  680,  530,  590,  590];
          const pos =     [700,  0,  130,   0,   0,  120,    0,  100];
          const neg =     [0,  130,    0,   0, 150,    0,  100,    0];
          return {
            backgroundColor:"transparent",
            tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},
            legend:{top:0,textStyle:{color:"#94a3b8"},itemWidth:10},
            xAxis:{type:"category",data:["Start","Q1+","Q1-","Q2+","Q2-","Q3+","Q3-","End"],axisLabel:{fontSize:10}},
            yAxis:{type:"value"},
            series:[
              {name:"Base",type:"bar",stack:"wf",data:base,itemStyle:{borderColor:"transparent",color:"transparent"},emphasis:{itemStyle:{borderColor:"transparent",color:"transparent"}}},
              {name:"Increase",type:"bar",stack:"wf",data:pos,itemStyle:{color:"#34d399"}},
              {name:"Decrease",type:"bar",stack:"wf",data:neg,itemStyle:{color:"#f87171"}}
            ]
          };
        })()}/>
      </Card>

      {/* 21. Calendar Heatmap */}
      <Card title="Calendar Heatmap">
        <EC h={160} option={{
          backgroundColor:"transparent",
          tooltip:{formatter:(raw)=>{ const p = (Array.isArray(raw)?raw[0]:raw) as {data:unknown[]}; return `${p.data[0]}: ${p.data[1]}`; }},
          visualMap:{min:0,max:10,show:false,inRange:{color:["#1e293b","#6366f1"]}},
          calendar:{range:"2024",top:30,left:40,right:10,bottom:10,
            yearLabel:{show:false},dayLabel:{nameMap:"en",fontSize:9,color:"#94a3b8"},
            monthLabel:{fontSize:9,color:"#94a3b8"},
            itemStyle:{borderColor:"#1e293b",borderWidth:2,color:"#1e293b"}
          },
          series:[{type:"heatmap",coordinateSystem:"calendar",
            data:(()=>{const d=[];const dt=new Date("2024-01-01");while(dt.getFullYear()===2024){d.push([dt.toISOString().slice(0,10),Math.round(Math.random()*10)]);dt.setDate(dt.getDate()+1);}return d;})()
          }]
        }}/>
      </Card>

      {/* 22. Horizontal Bar */}
      <Card title="Horizontal Bar">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          xAxis:{type:"value"},
          yAxis:{type:"category",data:["Node.js","Python","Rust","Go","TypeScript","Java","C++"],axisLabel:{fontSize:11}},
          series:[{type:"bar",data:[85,78,70,74,90,65,60],barMaxWidth:14,
            itemStyle:{color:(p:{dataIndex:number})=>{const c=["#818cf8","#34d399","#fb923c","#38bdf8","#f472b6","#a78bfa","#facc15"];return c[p.dataIndex%c.length];}}
          }]
        }}/>
      </Card>

      {/* 23. Step Line */}
      <Card title="Step Line">
        <EC option={{
          backgroundColor:"transparent",
          tooltip:{trigger:"axis"},
          xAxis:{type:"category",data:months,axisLabel:{fontSize:10}},
          yAxis:{type:"value"},
          series:[{name:"Releases",type:"line",step:"middle",data:[2,2,3,3,5,5,6,6,8,8,10,10],lineStyle:{color:"#facc15",width:2.5},itemStyle:{color:"#facc15"}}]
        }}/>
      </Card>

    </div>
  );
}
