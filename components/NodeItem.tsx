import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TaskNode, TaskStatus } from '../types';

interface NodeItemProps {
  node: TaskNode;
  scale: number; // Add scale prop for coordinate calculation
  isSelected: boolean;
  hasChildren: boolean; // New prop to check if we should show collapse button
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onHeightChange?: (id: string, height: number) => void; // New prop
  onToggleStatus: (id: string) => void;
  onToggleCollapse: (id: string) => void; // New prop
  onBreakdown: (id: string) => void;
  onDelete: (id: string) => void;
  isProcessing: boolean;
  texts: {
    breakdown: string;
    archiveTooltip: string;
  };
}

export const NodeItem: React.FC<NodeItemProps> = ({
  node,
  scale,
  isSelected,
  hasChildren,
  onNodeClick,
  onUpdatePosition,
  onHeightChange,
  onToggleStatus,
  onToggleCollapse,
  onBreakdown,
  onDelete,
  isProcessing,
  texts
}) => {
  const [isDragging, setIsDragging] = useState(false);
  
  // Store initial values for delta calculation
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
           // Only update if difference is significant or unset
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
    // Only drag if left click
    if (e.button !== 0) return;
    e.stopPropagation();
    
    // Call parent click handler for selection logic (Ctrl/Shift)
    onNodeClick(node.id, e);

    setIsDragging(true);
    // Record screen coordinates and initial node world coordinates
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dragStartRef.current) {
      // Calculate delta in screen pixels
      const dxScreen = e.clientX - dragStartRef.current.mouseX;
      const dyScreen = e.clientY - dragStartRef.current.mouseY;

      // Convert to world units by dividing by scale
      const dxWorld = dxScreen / scale;
      const dyWorld = dyScreen / scale;

      const newX = dragStartRef.current.nodeX + dxWorld;
      const newY = dragStartRef.current.nodeY + dyWorld;

      onUpdatePosition(node.id, newX, newY);
    }
  }, [isDragging, node.id, onUpdatePosition, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

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

  const isCompleted = node.status === TaskStatus.COMPLETED;

  return (
    <div
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`absolute transition-shadow duration-200 z-10 group`} 
      onMouseDown={handleMouseDown}
    >
      {/* Inlet Port (Top) */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-700/80 rounded-t-sm border border-slate-600 z-0 flex justify-center">
         <div className="w-10 h-1 bg-slate-500 rounded-full mt-1 opacity-50"></div>
      </div>

      {/* Main Card */}
      <div
        ref={nodeRef}
        className={`
          relative flex flex-col items-start gap-2 p-4 rounded-lg border-2 w-64 backdrop-blur-md shadow-2xl transition-all z-10
          ${isSelected 
            ? 'border-accent shadow-[0_0_20px_rgba(244,114,182,0.4)] scale-105' 
            : isCompleted 
                ? 'bg-success/10 border-success/30 shadow-[0_0_15px_rgba(74,222,128,0.2)]' 
                : 'bg-surface/90 border-slate-600 shadow-xl hover:border-primary/50'
          }
          ${node.collapsed ? 'border-dashed border-slate-500 opacity-90' : ''}
        `}
      >
        <div className="flex items-start justify-between w-full">
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

        <div className="w-full">
          <h3 className={`font-mono text-sm font-bold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-white'}`}>
            {node.label}
          </h3>
          {node.description && !node.collapsed && (
            <p className="text-xs text-slate-400 mt-2 leading-relaxed border-t border-white/5 pt-2">
              {node.description}
            </p>
          )}
        </div>

        {/* Action Bar */}
        {!isCompleted && !node.collapsed && (
          <div className="w-full flex justify-end mt-2 pt-2 border-t border-white/5">
            <button
              onClick={(e) => { e.stopPropagation(); onBreakdown(node.id); }}
              disabled={isProcessing}
              className="text-xs flex items-center gap-1 text-primary hover:text-white transition-colors disabled:opacity-50 font-mono"
            >
              {isProcessing ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              )}
              {texts.breakdown}
            </button>
          </div>
        )}
      </div>

      {/* Outlet Port (Bottom) - Only show if expanded or has children */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-16 h-3 bg-slate-700/80 rounded-b-sm border border-slate-600 z-0 flex justify-center items-end pointer-events-auto">
         {hasChildren && (
            <button 
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
                className="w-4 h-4 -mb-2 bg-slate-800 border border-slate-500 rounded-full flex items-center justify-center text-[10px] text-white hover:bg-primary hover:border-primary transition-colors shadow-lg z-20"
                title={node.collapsed ? "Expand" : "Collapse"}
            >
                {node.collapsed ? '+' : '-'}
            </button>
         )}
         <div className="w-10 h-1 bg-slate-500 rounded-full mb-1 opacity-50"></div>
      </div>
    </div>
  );
};
