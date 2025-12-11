import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TaskNode, TaskStatus } from '../types';

interface NodeItemProps {
  node: TaskNode;
  scale: number;
  isSelected: boolean;
  hasChildren: boolean;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  onNodeDoubleClick: (id: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onHeightChange?: (id: string, height: number) => void;
  onToggleStatus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onConnectStart: (id: string, type: 'source' | 'target', e: React.MouseEvent) => void; 
  onConnectEnd: (id: string, type: 'source' | 'target') => void; 
  onVerticalBreakdown: (id: string) => void;
  onHorizontalBreakdown: (id: string) => void;
  onDelete: (id: string) => void;
  onConfigChange?: (id: string, config: any) => void; // New prop for updating config
  isProcessing: boolean;
  texts: {
    breakdown: string;
    horizontalBreakdown: string;
    archiveTooltip: string;
    enterNode: string;
    frequency: string;
    interval: string;
    seconds: string;
    fetch: string;
    fetching: string;
    url: string;
  };
}

export const NodeItem: React.FC<NodeItemProps> = ({
  node,
  scale,
  isSelected,
  hasChildren,
  onNodeClick,
  onNodeDoubleClick,
  onUpdatePosition,
  onHeightChange,
  onToggleStatus,
  onToggleCollapse,
  onConnectStart,
  onConnectEnd,
  onVerticalBreakdown,
  onHorizontalBreakdown,
  onDelete,
  onConfigChange,
  isProcessing,
  texts
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const hasMoved = useRef(false);
  
  const dragStartRef = useRef<{ 
    mouseX: number; 
    mouseY: number; 
    nodeX: number; 
    nodeY: number 
  } | null>(null);
  
  const nodeRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Measure height changes
  useEffect(() => {
    if (nodeRef.current && onHeightChange) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
           const height = entry.contentRect.height;
           if (!node.height || Math.abs(node.height - height) > 2) {
             onHeightChange(node.id, height);
           }
        }
      });
      resizeObserverRef.current.observe(nodeRef.current);
    }
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [node.id, node.height, onHeightChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection during drag
    
    // Defer selection to mouse up (to distinguish click vs drag)
    hasMoved.current = false;

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dragStartRef.current) {
      const dxScreen = e.clientX - dragStartRef.current.mouseX;
      const dyScreen = e.clientY - dragStartRef.current.mouseY;

      // Check if moved enough to consider it a drag
      if (!hasMoved.current && (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3)) {
          hasMoved.current = true;
      }

      const dxWorld = dxScreen / scale;
      const dyWorld = dyScreen / scale;

      const newX = dragStartRef.current.nodeX + dxWorld;
      const newY = dragStartRef.current.nodeY + dyWorld;

      onUpdatePosition(node.id, newX, newY);
    }
  }, [isDragging, node.id, onUpdatePosition, scale]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (isDragging) {
        setIsDragging(false);
        dragStartRef.current = null;

        // If it wasn't a drag (didn't move significantly), treat as click -> Select
        if (!hasMoved.current) {
             // We cast the native event to React.MouseEvent mostly for TS compliance,
             // as App handles standard properties like shiftKey/ctrlKey which exist on both.
             onNodeClick(node.id, e as unknown as React.MouseEvent);
        }
    }
  }, [isDragging, node.id, onNodeClick]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // --- Type Specific Logic ---

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onConfigChange) {
      onConfigChange(node.id, { ...node.config, frequency: parseFloat(e.target.value) });
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onConfigChange) {
      onConfigChange(node.id, { ...node.config, interval: parseFloat(e.target.value) });
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onConfigChange) {
      onConfigChange(node.id, { ...node.config, url: e.target.value });
    }
  };

  const handleFetch = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!node.config?.url || !onConfigChange) return;
      
      onConfigChange(node.id, { ...node.config, isFetching: true, lastError: null });

      try {
          // Simple fetch implementation
          const res = await fetch(node.config.url);
          const data = await res.json();
          onConfigChange(node.id, { ...node.config, lastData: data, isFetching: false, value: data });
      } catch (err) {
          console.error(err);
          onConfigChange(node.id, { ...node.config, lastError: "Fetch failed", isFetching: false });
      }
  };

  const isCompleted = node.status === TaskStatus.COMPLETED;
  
  // Dynamic Styles based on type
  let typeStyles = "";
  if (node.type === 'oscillator') typeStyles = "border-cyan-500 shadow-cyan-500/20";
  else if (node.type === 'timer') typeStyles = "border-emerald-500 shadow-emerald-500/20";
  else if (node.type === 'display') typeStyles = "border-yellow-500 shadow-yellow-500/20";
  else if (node.type === 'api') typeStyles = "border-purple-500 shadow-purple-500/20";
  else typeStyles = isCompleted 
      ? 'bg-success/10 border-success/30 shadow-[0_0_15px_rgba(74,222,128,0.2)]' 
      : 'bg-surface/90 border-slate-600 shadow-xl hover:border-primary/50';

  return (
    <div
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`absolute transition-all duration-200 z-10 group`} 
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onNodeDoubleClick(node.id); }}
    >
      {/* Inlet Port (Top) - Target */}
      <div 
        className={`absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-3 rounded-t-sm border z-0 flex justify-center cursor-crosshair transition-colors
           ${node.type === 'api' ? 'bg-purple-900/80 border-purple-500 hover:bg-purple-700' : 'bg-slate-700/80 border-slate-600 hover:bg-slate-600 hover:border-primary/50'}
        `}
        onMouseDown={(e) => {
            e.stopPropagation();
            onConnectStart(node.id, 'target', e);
        }}
        onMouseUp={(e) => {
            e.stopPropagation();
            onConnectEnd(node.id, 'target');
        }}
      >
         <div className="w-10 h-1 bg-slate-500 rounded-full mt-1 opacity-50 pointer-events-none"></div>
      </div>

      {/* Main Card */}
      <div
        ref={nodeRef}
        className={`
          relative flex flex-col items-start gap-2 p-4 rounded-lg border-2 w-64 backdrop-blur-md shadow-2xl transition-all z-10
          ${isSelected 
            ? 'border-accent shadow-[0_0_20px_rgba(244,114,182,0.4)] scale-105' 
            : typeStyles
          }
          ${hasChildren ? 'border-l-4 border-l-primary/70' : ''}
          ${node.collapsed ? 'border-dashed border-slate-500 opacity-90' : ''}
          ${node.type !== 'task' ? 'bg-surface/95' : ''} 
        `}
      >
        <div className="flex items-start justify-between w-full">
            {/* Type Icon / Checkbox */}
            <div className="flex items-center gap-2">
                {node.type === 'task' ? (
                     <button
                        onClick={(e) => { e.stopPropagation(); onToggleStatus(node.id); }}
                        className={`
                            w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-colors
                            ${isCompleted ? 'bg-success border-success text-black' : 'border-slate-500 hover:border-primary'}
                        `}
                        >
                        {isCompleted && (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                ) : (
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider
                        ${node.type === 'oscillator' ? 'text-cyan-400 border-cyan-400/50 bg-cyan-400/10' : ''}
                        ${node.type === 'timer' ? 'text-emerald-400 border-emerald-400/50 bg-emerald-400/10' : ''}
                        ${node.type === 'display' ? 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10' : ''}
                        ${node.type === 'api' ? 'text-purple-400 border-purple-400/50 bg-purple-400/10' : ''}
                    `}>
                        {node.type.substring(0, 4)}
                    </div>
                )}
            </div>
            
            <div className="flex gap-1">
                 {/* Container Indicator */}
                {hasChildren && (
                    <div className="px-1.5 py-0.5 rounded bg-primary/20 text-[10px] text-primary border border-primary/30 font-mono tracking-tighter" title="Container Node">
                        COMP
                    </div>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                    className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={texts.archiveTooltip}
                >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>

        <div className="w-full group-hover:text-primary transition-colors">
          <h3 className={`font-mono text-sm font-bold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-white'}`}>
            {node.label}
          </h3>
          
          {/* RENDER BASED ON NODE TYPE */}
          
          {/* TASK NODE */}
          {node.type === 'task' && node.description && !node.collapsed && (
            <p className="text-xs text-slate-400 mt-2 leading-relaxed border-t border-white/5 pt-2">
              {node.description}
            </p>
          )}

          {/* OSCILLATOR NODE */}
          {node.type === 'oscillator' && (
              <div className="mt-3 border-t border-cyan-500/30 pt-2">
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-cyan-400 font-mono">{texts.frequency}: {node.config?.frequency || 1}Hz</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="5" 
                    step="0.1" 
                    value={node.config?.frequency || 1}
                    onChange={handleFrequencyChange}
                    onMouseDown={(e) => e.stopPropagation()} 
                    className="w-full h-1 bg-cyan-900 rounded-lg appearance-none cursor-pointer"
                  />
                  {/* Visualizer */}
                  <div className="mt-2 h-8 w-full bg-black/40 rounded flex items-end overflow-hidden relative">
                      <div 
                        className="absolute bottom-0 left-0 w-full bg-cyan-500/50 transition-all duration-75"
                        style={{ height: `${(node.value || 0) * 100}%` }}
                      ></div>
                      <div className="w-full text-center text-[10px] text-white z-10 mix-blend-difference font-mono leading-8">
                          {(node.value || 0).toFixed(2)}
                      </div>
                  </div>
              </div>
          )}

          {/* TIMER NODE */}
          {node.type === 'timer' && (
              <div className="mt-3 border-t border-emerald-500/30 pt-2">
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-emerald-400 font-mono">{texts.interval}: {node.config?.interval || 1}{texts.seconds}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="0.5" 
                    value={node.config?.interval || 1}
                    onChange={handleIntervalChange}
                    onMouseDown={(e) => e.stopPropagation()} 
                    className="w-full h-1 bg-emerald-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  {/* Pulse Visualizer */}
                  <div className="mt-2 flex items-center gap-2">
                      <div className={`w-full h-4 rounded border transition-colors duration-75 ${
                          (node.value && node.value > 0.5) 
                          ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_#10b981]' 
                          : 'bg-black/40 border-emerald-900'
                        }`}>
                      </div>
                      <div className="text-[10px] font-mono text-emerald-400">
                          {node.value ? 'ON' : 'OFF'}
                      </div>
                  </div>
              </div>
          )}

          {/* API NODE */}
          {node.type === 'api' && (
              <div className="mt-3 border-t border-purple-500/30 pt-2 space-y-2">
                  <div className="flex gap-1">
                    <input 
                        type="text" 
                        value={node.config?.url || ''} 
                        onChange={handleUrlChange}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()} // Allow typing
                        placeholder="https://api.example.com/data"
                        className="flex-1 bg-black/30 border border-purple-500/30 rounded px-1 text-[10px] text-white font-mono"
                    />
                    <button 
                        onClick={handleFetch}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-[10px] rounded text-white disabled:opacity-50"
                        disabled={node.config?.isFetching}
                    >
                        {node.config?.isFetching ? '...' : texts.fetch}
                    </button>
                  </div>
                  <div className="h-16 w-full bg-black/40 rounded overflow-auto p-1 text-[9px] text-green-400 font-mono whitespace-pre-wrap scrollbar-thin relative">
                      {node.config?.isFetching && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-purple-300">
                             {texts.fetching}
                          </div>
                      )}
                      {node.config?.lastData ? JSON.stringify(node.config.lastData, null, 2) : (node.config?.lastError || "No Data")}
                  </div>
              </div>
          )}

          {/* DISPLAY NODE */}
          {node.type === 'display' && (
              <div className="mt-3 border-t border-yellow-500/30 pt-2 flex items-center justify-center">
                  <div className="text-3xl font-mono text-yellow-400 font-bold tracking-tighter truncate w-full text-center">
                      {typeof node.value === 'number' 
                        ? node.value.toFixed(2) 
                        : (typeof node.value === 'object' ? 'JSON' : (node.value || 'NULL'))}
                  </div>
              </div>
          )}

        </div>

        {/* Action Bar (Only for tasks mostly, but maybe structure for others) */}
        {node.type === 'task' && !isCompleted && !node.collapsed && (
          <div className="w-full flex justify-between gap-2 mt-2 pt-2 border-t border-white/5">
             <button
              onClick={(e) => { e.stopPropagation(); onVerticalBreakdown(node.id); }}
              disabled={isProcessing}
              className="flex-1 text-[10px] flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 rounded py-1 text-primary hover:text-white transition-colors disabled:opacity-50 font-mono"
              title={texts.breakdown}
            >
              {isProcessing ? <span className="animate-spin">⟳</span> : <span>↓</span>}
              {texts.breakdown}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onHorizontalBreakdown(node.id); }}
              disabled={isProcessing}
              className="flex-1 text-[10px] flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 rounded py-1 text-accent hover:text-white transition-colors disabled:opacity-50 font-mono"
              title={texts.horizontalBreakdown}
            >
              {isProcessing ? <span className="animate-spin">⟳</span> : <span>→</span>}
              {texts.horizontalBreakdown}
            </button>
          </div>
        )}
      </div>

      {/* Outlet Port (Bottom) - Source */}
      <div 
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-700/80 rounded-b-sm border border-slate-600 z-0 flex justify-center items-end pointer-events-auto cursor-crosshair hover:bg-slate-600 hover:border-primary/50 transition-colors"
        onMouseDown={(e) => {
            e.stopPropagation();
            onConnectStart(node.id, 'source', e);
        }}
        onMouseUp={(e) => {
            e.stopPropagation();
            onConnectEnd(node.id, 'source');
        }}
      >
         {hasChildren && (
            <button 
                onClick={(e) => { e.stopPropagation(); onNodeDoubleClick(node.id); }}
                onMouseDown={(e) => e.stopPropagation()} 
                className="w-4 h-4 -mb-2 bg-slate-800 border border-slate-500 rounded-full flex items-center justify-center text-[8px] text-white hover:bg-primary hover:border-primary transition-colors shadow-lg z-20 group-hover:scale-125 duration-150"
                title={texts.enterNode}
            >
                ↘
            </button>
         )}
         <div className="w-10 h-1 bg-slate-500 rounded-full mb-1 opacity-50 pointer-events-none"></div>
      </div>
    </div>
  );
};