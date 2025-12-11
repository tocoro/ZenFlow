import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ZenChartProps {
  data: { time: string; active: number; done: number }[];
  texts: {
    title: string;
    active: string;
    done: string;
  }
}

export const ZenChart: React.FC<ZenChartProps> = ({ data, texts }) => {
  return (
    <div className="w-full h-48 bg-surface/50 rounded-lg p-2 border border-white/5">
      <h4 className="text-xs font-mono text-slate-400 mb-2 uppercase tracking-wider">{texts.title}</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 5,
            right: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4ade80" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis hide />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px' }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Area type="monotone" dataKey="active" stroke="#38bdf8" fillOpacity={1} fill="url(#colorActive)" name={texts.active} />
          <Area type="monotone" dataKey="done" stroke="#4ade80" fillOpacity={1} fill="url(#colorDone)" name={texts.done} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};