import React, { useState, useRef, useEffect } from 'react';
import { TaskNode, TaskStatus } from '../types';
import { translations, Language } from '../translations';

interface NodeDetailPanelProps {
  node: TaskNode;
  lang: Language;
  initialX: number;
  initialY: number;
  onUpdate: (id: string, label: string, description: string) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectDownstream: (id: string) => void;
  onClose: () => void;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  lang,
  initialX,
  initialY,
  onUpdate,
  onToggleStatus,
  onDelete,
  onSelectDownstream,
  onClose
}) => {
  const t = translations[lang];
  const isCompleted = node.status === TaskStatus.COMPLETED;

  // --- Dragging Logic ---
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  // Update position when initial props change (e.g. node selection change)
  // We use a ref to track the last node ID to avoid resetting position just on re-renders,
  // but if the parent *intends* to move it (by changing initialX/Y significantly along with ID), we update.
  useEffect(() => {
    setPosition({ x: initialX, y: initialY });
  }, [initialX, initialY]); // Dependency on coordinates allows the panel to move if the node moves in the background or new node selected.

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag on left click
    if (e.button !== 0) return;
    e.stopPropagation(); // Stop bubbling to App (prevents panning)
    e.preventDefault(); // Prevent text selection
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      setPosition({
        x: dragStartRef.current.startX + dx,
        y: dragStartRef.current.startY + dy
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(node.id, e.target.value, node.description || '');
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(node.id, node.label, e.target.value);
  };

  return (
    <div 
        className="fixed w-80 bg-surface/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-40 p-5 animate-in fade-in zoom-in-95 duration-200"
        style={{ left: position.x, top: position.y }}
        onMouseDown={(e) => e.stopPropagation()} // Prevent panning when clicking anywhere on the panel
    >
      
      {/* Header - Draggable Area */}
      <div 
        className="flex justify-between items-center mb-4 pb-2 border-b border-white/10 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <h3 className="text-sm font-mono font-bold text-primary flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
          {t.nodeDetails}
        </h3>
        <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-white transition-colors cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking close
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        
        {/* Label Input */}
        <div>
          <label className="block text-[10px] uppercase text-slate-500 font-mono mb-1">{t.label}</label>
          <input
            type="text"
            value={node.label}
            onChange={handleLabelChange}
            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Description Input */}
        <div>
          <label className="block text-[10px] uppercase text-slate-500 font-mono mb-1">{t.description}</label>
          <textarea
            value={node.description || ''}
            onChange={handleDescriptionChange}
            rows={3}
            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-primary/50 transition-colors resize-none"
          />
        </div>

        {/* Meta Data */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500 border-t border-b border-white/5 py-3">
          <div>
            <span className="block uppercase mb-0.5">{t.id}</span>
            <span className="text-slate-400 select-all">{node.id}</span>
          </div>
          <div>
            <span className="block uppercase mb-0.5">{t.createdAt}</span>
            <span className="text-slate-400">{new Date(node.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">{t.status}</span>
            <button
                onClick={() => onToggleStatus(node.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                    isCompleted 
                    ? 'bg-success/20 text-success border-success/50' 
                    : 'bg-primary/20 text-primary border-primary/50'
                }`}
            >
                {isCompleted ? t.statDone : t.statActive}
            </button>
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col gap-2">
            <button
                onClick={() => onSelectDownstream(node.id)}
                className="w-full py-2 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-xs text-slate-300 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                </svg>
                {t.selectDownstream}
            </button>

            <button
                onClick={() => onDelete(node.id)}
                className="w-full py-2 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400 transition-colors"
            >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t.archive}
            </button>
        </div>

      </div>
    </div>
  );
};