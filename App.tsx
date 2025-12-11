import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { breakDownTask } from './services/geminiService';
import { TaskNode, TaskEdge, TaskStatus, Coordinates } from './types';
import { NodeItem } from './components/NodeItem';
import { ZenChart } from './components/ZenChart';
import { ZenState } from './components/ZenState';
import { SettingsModal } from './components/SettingsModal';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { translations, Language } from './translations';

// Helper to generate IDs
const uid = () => Math.random().toString(36).substr(2, 9);

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

function App() {
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [edges, setEdges] = useState<TaskEdge[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('ja');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false); // State for help toggle
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  
  // Viewport State
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  const t = translations[lang];

  // Stats for the chart
  const [chartData, setChartData] = useState<{ time: string; active: number; done: number }[]>([]);

  // Initialize chart data
  useEffect(() => {
    setChartData([{ time: 'Start', active: 0, done: 0 }]);
  }, []);

  // Update chart when nodes change
  useEffect(() => {
    const active = nodes.filter(n => n.status === TaskStatus.PENDING).length;
    const done = nodes.filter(n => n.status === TaskStatus.COMPLETED).length;
    
    setChartData(prev => {
      const newData = [...prev, { time: new Date().toLocaleTimeString(), active, done }];
      if (newData.length > 20) return newData.slice(newData.length - 20);
      return newData;
    });
  }, [nodes.length, nodes]); 

  // --- EXPORT / IMPORT LOGIC ---
  const handleExport = useCallback(() => {
    const data = {
      version: 1,
      timestamp: Date.now(),
      nodes,
      edges
    };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = href;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `zenflow_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }, [nodes, edges]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && Array.isArray(json.nodes) && Array.isArray(json.edges)) {
            // Basic validation passed
            setNodes(json.nodes);
            setEdges(json.edges);
            
            // Optionally reset view or selection
            setSelectedNodeIds(new Set());
            setIsSettingsOpen(false); // Close modal on success
        } else {
            alert(lang === 'ja' ? "無効なファイル形式です。" : "Invalid file format.");
        }
      } catch (err) {
        console.error("Import error:", err);
        alert(lang === 'ja' ? "ファイルの読み込みに失敗しました。" : "Failed to load file.");
      }
    };
    reader.readAsText(file);
  }, [lang]);


  // --- VIEWPORT CONTROLS (WASD) ---
  useEffect(() => {
    let animationFrameId: number;
    
    const updateMovement = () => {
        let dx = 0;
        let dy = 0;
        const speed = 10 / viewport.scale; // Move faster when zoomed out

        if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) dy += speed;
        if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) dy -= speed;
        if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) dx += speed;
        if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) dx -= speed;

        if (dx !== 0 || dy !== 0) {
            setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        }
        
        animationFrameId = requestAnimationFrame(updateMovement);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if typing in input
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        keysPressed.current.add(e.key.toLowerCase());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    animationFrameId = requestAnimationFrame(updateMovement);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        cancelAnimationFrame(animationFrameId);
    };
  }, [viewport.scale]);

  // --- VIEWPORT PANNING (MOUSE) ---
  const handlePanStart = (e: React.MouseEvent) => {
    // Only pan on background click (left or middle)
    if (e.button !== 0 && e.button !== 1) return;
    
    setIsPanning(true);
    lastPanRef.current = { x: e.clientX, y: e.clientY };
    setSelectedNodeIds(new Set()); // Clear selection when clicking bg
  };

  const handlePanMove = useCallback((e: MouseEvent) => {
    if (isPanning && lastPanRef.current) {
        const dx = e.clientX - lastPanRef.current.x;
        const dy = e.clientY - lastPanRef.current.y;
        
        setViewport(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy
        }));
        
        lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    lastPanRef.current = null;
  }, []);

  useEffect(() => {
    if (isPanning) {
        window.addEventListener('mousemove', handlePanMove);
        window.addEventListener('mouseup', handlePanEnd);
    } else {
        window.removeEventListener('mousemove', handlePanMove);
        window.removeEventListener('mouseup', handlePanEnd);
    }
    return () => {
        window.removeEventListener('mousemove', handlePanMove);
        window.removeEventListener('mouseup', handlePanEnd);
    };
  }, [isPanning, handlePanMove, handlePanEnd]);

  // --- TRAVERSAL & SELECTION LOGIC ---
  
  // Recursively find all downstream nodes
  const getDownstreamNodes = useCallback((startIds: string[], currentSet: Set<string> = new Set()) => {
    const queue = [...startIds];
    const result = new Set(currentSet);
    // Add startIds themselves if not present (though usually they are)
    startIds.forEach(id => result.add(id));

    while(queue.length > 0) {
        const currentId = queue.shift()!;
        const children = edges
            .filter(e => e.source === currentId)
            .map(e => e.target);
        
        for (const childId of children) {
            if (!result.has(childId)) {
                result.add(childId);
                queue.push(childId);
            }
        }
    }
    return result;
  }, [edges]);

  // --- VISIBILITY LOGIC (COLLAPSE/EXPAND) ---
  
  // A node is hidden if ANY of its ancestors are collapsed.
  // We need to traverse from roots down or simply check upstream for any collapsed node.
  // Since edges are directed Source -> Target, we can check incoming edges.
  // However, traversing "up" from every node every render is expensive.
  // Better: Traverse "down" from collapsed nodes to mark hidden nodes.
  
  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    const collapsedNodes = nodes.filter(n => n.collapsed);
    
    if (collapsedNodes.length === 0) return hidden;

    const queue = collapsedNodes.map(n => n.id);
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      // Find children
      const children = edges
        .filter(e => e.source === currentId)
        .map(e => e.target);

      for (const childId of children) {
        if (!hidden.has(childId)) {
          hidden.add(childId);
          queue.push(childId);
        }
      }
    }
    return hidden;
  }, [nodes, edges]);

  // Filter nodes and edges for rendering
  const visibleNodes = useMemo(() => nodes.filter(n => !hiddenNodeIds.has(n.id)), [nodes, hiddenNodeIds]);
  const visibleEdges = useMemo(() => edges.filter(e => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target)), [edges, hiddenNodeIds]);


  // --- AUTO ALIGNMENT LOGIC ---
  const handleAutoAlign = () => {
    if (nodes.length === 0) return;

    // 1. Identify Roots (nodes with no incoming edges)
    const incomingEdgeCount: Record<string, number> = {};
    nodes.forEach(n => incomingEdgeCount[n.id] = 0);
    edges.forEach(e => {
        if (incomingEdgeCount[e.target] !== undefined) {
            incomingEdgeCount[e.target]++;
        }
    });

    const roots = nodes.filter(n => incomingEdgeCount[n.id] === 0);
    
    // 2. BFS to determine depth (level)
    const depths: Record<string, number> = {};
    const queue: { id: string, depth: number }[] = roots.map(n => ({ id: n.id, depth: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        
        // Keep max depth if visited multiple times (DAG)
        if (depths[id] === undefined || depth > depths[id]) {
            depths[id] = depth;
        }

        const children = edges.filter(e => e.source === id).map(e => e.target);
        children.forEach(childId => {
            queue.push({ id: childId, depth: depth + 1 });
        });
    }

    // Handle disjoint cycles or unvisited nodes (assign them depth 0 or handled separately)
    nodes.forEach(n => {
        if (depths[n.id] === undefined) depths[n.id] = 0;
    });

    // 3. Group by Level
    const levels: Record<number, string[]> = {};
    Object.entries(depths).forEach(([id, depth]) => {
        if (!levels[depth]) levels[depth] = [];
        levels[depth].push(id);
    });

    // 4. Assign Coordinates
    const HORIZONTAL_SPACING = 300;
    const VERTICAL_SPACING = 200;
    const START_Y = 100;
    
    // Calculate center of the screen in world coordinates
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.scale;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.scale;

    // Find bounds of new layout to center it
    const maxDepth = Math.max(...Object.keys(levels).map(Number));
    const totalHeight = maxDepth * VERTICAL_SPACING;
    
    const newPositions: Record<string, Coordinates> = {};

    Object.entries(levels).forEach(([depthStr, nodeIds]) => {
        const depth = parseInt(depthStr);
        const rowWidth = nodeIds.length * HORIZONTAL_SPACING;
        const startX = centerX - (rowWidth / 2);
        
        nodeIds.forEach((id, index) => {
            newPositions[id] = {
                x: startX + (index * HORIZONTAL_SPACING),
                y: centerY - (totalHeight / 2) + (depth * VERTICAL_SPACING)
            };
        });
    });

    setNodes(prev => prev.map(n => newPositions[n.id] ? { ...n, position: newPositions[n.id] } : n));
  };


  // --- MOUSE WHEEL LOGIC (Zoom & Selection Traverse) ---
  const handleWheel = (e: React.WheelEvent) => {
    if (e.shiftKey && selectedNodeIds.size > 0) {
        // --- SELECTION EXPANSION / SHRINKING ---
        if (e.deltaY < 0) {
            // SCROLL UP: Expand selection (Add children of current selection)
            const newChildren = new Set<string>();
            selectedNodeIds.forEach(id => {
                const children = edges
                    .filter(edge => edge.source === id)
                    .map(edge => edge.target);
                children.forEach(child => {
                    if (!selectedNodeIds.has(child)) {
                        newChildren.add(child);
                    }
                });
            });

            if (newChildren.size > 0) {
                setSelectedNodeIds(prev => {
                   const next = new Set(prev);
                   newChildren.forEach(id => next.add(id));
                   return next;
                });
            }
        } else {
            // SCROLL DOWN: Shrink selection (Remove downstream leaves of current selection)
            setSelectedNodeIds(prev => {
                const next = new Set(prev);
                const nodesToRemove = Array.from(prev).filter(id => {
                    const targets = edges
                        .filter(edge => edge.source === id)
                        .map(edge => edge.target);
                    return targets.every(t => !prev.has(t));
                });
                
                if (nodesToRemove.length === prev.size && prev.size > 0) {
                    return next; 
                }

                nodesToRemove.forEach(id => next.delete(id));
                return next;
            });
        }

    } else {
        // --- ZOOM ---
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(viewport.scale * (1 + scaleAmount), 0.1), 5);

        const worldX = (e.clientX - viewport.x) / viewport.scale;
        const worldY = (e.clientY - viewport.y) / viewport.scale;

        const newX = e.clientX - (worldX * newScale);
        const newY = e.clientY - (worldY * newScale);

        setViewport({
            x: newX,
            y: newY,
            scale: newScale
        });
    }
  };

  const addTask = (label: string, parentId?: string, origin?: { x: number, y: number }) => {
    if (!label.trim()) return null;

    // Center in Viewport if no origin
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.scale;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.scale;

    let x, y;

    if (origin) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 200 + Math.random() * 100;
      x = origin.x + Math.cos(angle) * distance;
      y = origin.y + Math.sin(angle) * distance;
    } else {
      x = centerX - 128 + (Math.random() * 100 - 50);
      y = centerY - 100 + (Math.random() * 100 - 50);
    }

    const newNode: TaskNode = {
      id: uid(),
      label,
      status: TaskStatus.PENDING,
      position: { x, y },
      createdAt: Date.now(),
      parentId
    };

    setNodes(prev => [...prev, newNode]);

    if (parentId) {
      const newEdge: TaskEdge = {
        id: uid(),
        source: parentId,
        target: newNode.id
      };
      setEdges(prev => [...prev, newEdge]);
    }

    return newNode;
  };

  const handleKeyDownInput = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTask(inputValue);
      setInputValue('');
    }
  };

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, position: { x, y } } : n));
  }, []);
  
  // New handler for height updates from NodeItem
  const updateNodeHeight = useCallback((id: string, height: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, height } : n));
  }, []);

  const updateNodeText = useCallback((id: string, label: string, description: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, label, description } : n));
  }, []);

  const toggleNodeStatus = useCallback((id: string) => {
    setNodes(prev => prev.map(n => 
      n.id === id 
        ? { ...n, status: n.status === TaskStatus.PENDING ? TaskStatus.COMPLETED : TaskStatus.PENDING } 
        : n
    ));
  }, []);
  
  const toggleNodeCollapse = useCallback((id: string) => {
    setNodes(prev => prev.map(n => 
      n.id === id 
        ? { ...n, collapsed: !n.collapsed } 
        : n
    ));
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    setSelectedNodeIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
    });
  }, []);

  const deleteSelectedNodes = () => {
    const idsToDelete = Array.from(selectedNodeIds);
    setNodes(prev => prev.filter(n => !idsToDelete.includes(n.id)));
    setEdges(prev => prev.filter(e => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)));
    setSelectedNodeIds(new Set());
  };

  const handleNodeClick = (id: string, e: React.MouseEvent) => {
    if (e.altKey) {
        // Alt + Click: Select full downstream tree
        const treeNodes = getDownstreamNodes([id], selectedNodeIds);
        setSelectedNodeIds(treeNodes);
    } else if (e.ctrlKey || e.metaKey || e.shiftKey) {
        // Ctrl/Shift + Click: Toggle Selection
        setSelectedNodeIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    } else {
        // Click: Single Select (if not already selected, usually)
        setSelectedNodeIds(prev => {
            if (prev.has(id)) return prev;
            return new Set([id]);
        });
    }
  };

  const selectDownstream = () => {
    const allDownstream = getDownstreamNodes(Array.from(selectedNodeIds), selectedNodeIds);
    setSelectedNodeIds(allDownstream);
  };
  
  const selectDownstreamFromNode = (id: string) => {
    const allDownstream = getDownstreamNodes([id]);
    setSelectedNodeIds(allDownstream);
  };

  const chainSelectedNodes = () => {
    if (selectedNodeIds.size < 2) return;

    const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selectedNodes.forEach(n => {
        minX = Math.min(minX, n.position.x);
        maxX = Math.max(maxX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxY = Math.max(maxY, n.position.y);
    });

    const isHorizontal = (maxX - minX) > (maxY - minY);
    
    selectedNodes.sort((a, b) => isHorizontal 
        ? a.position.x - b.position.x 
        : a.position.y - b.position.y
    );

    const newEdges = [...edges];
    for (let i = 0; i < selectedNodes.length - 1; i++) {
        const source = selectedNodes[i];
        const target = selectedNodes[i+1];
        
        const exists = newEdges.some(e => e.source === source.id && e.target === target.id);
        if (!exists) {
            newEdges.push({
                id: uid(),
                source: source.id,
                target: target.id
            });
        }
    }
    setEdges(newEdges);

    const startX = selectedNodes[0].position.x;
    const startY = selectedNodes[0].position.y;
    const spacing = 280; 

    const updatedNodes = nodes.map(n => {
        const index = selectedNodes.findIndex(sn => sn.id === n.id);
        if (index === -1) return n;

        return {
            ...n,
            position: {
                x: isHorizontal ? startX + (index * spacing) : startX + (index * 50),
                y: isHorizontal ? startY + (index * 50) : startY + (index * 150)
            }
        };
    });
    setNodes(updatedNodes);
  };

  const handleBreakdown = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node || processingId) return;

    setProcessingId(id);
    const context = nodes.map(n => n.label);
    const result = await breakDownTask(node.label, context, lang);

    if (result.subtasks.length > 0) {
      const createdSubtasks: TaskNode[] = [];
      const newEdges: TaskEdge[] = [];
      const origin = node.position;
      const originHeight = node.height || 100;
      
      const spacing = 250;
      
      result.subtasks.forEach((task, index) => {
         // Vertical layout for breakdown
         const offsetX = (index - (result.subtasks.length - 1) / 2) * spacing;
         const offsetY = originHeight + 100; // Place below the parent

         const newNode: TaskNode = {
            id: uid(),
            label: task.label,
            description: task.description,
            status: TaskStatus.PENDING,
            position: { x: origin.x + offsetX, y: origin.y + offsetY },
            createdAt: Date.now(),
            parentId: id
         };
         createdSubtasks.push(newNode);

         newEdges.push({
             id: uid(),
             source: id,
             target: newNode.id
         });
      });

      if (result.dependencies) {
          result.dependencies.forEach(dep => {
              const sourceNode = createdSubtasks[dep.fromIndex];
              const targetNode = createdSubtasks[dep.toIndex];
              if (sourceNode && targetNode) {
                  newEdges.push({
                      id: uid(),
                      source: sourceNode.id,
                      target: targetNode.id
                  });
                  // Adjust target position to be below source
                  targetNode.position.y = sourceNode.position.y + 150;
                  targetNode.position.x = sourceNode.position.x;
              }
          });
      }

      setNodes(prev => [...prev, ...createdSubtasks]);
      setEdges(prev => [...prev, ...newEdges]);
    }

    setProcessingId(null);
  };

  const activeNodesCount = useMemo(() => nodes.filter(n => n.status === TaskStatus.PENDING).length, [nodes]);

  const renderEdges = useMemo(() => {
    return visibleEdges.map(edge => {
      const source = visibleNodes.find(n => n.id === edge.source);
      const target = visibleNodes.find(n => n.id === edge.target);

      if (!source || !target) return null;

      // Calculate connection points
      // Source: Bottom Center
      const sourceX = source.position.x + 128; // width is 256px
      // Use reported height, fallback to approximation, add offset for the visual outlet
      const sourceHeight = source.height || 100; 
      const sourceY = source.position.y + sourceHeight + 4; 
      
      // Target: Top Center
      const targetX = target.position.x + 128;
      const targetY = target.position.y - 4; // slight offset for visual inlet

      // Vertical Bezier Curve
      const distY = Math.abs(targetY - sourceY);
      const controlY = Math.max(distY * 0.5, 80);

      const path = `M${sourceX},${sourceY} C${sourceX},${sourceY + controlY} ${targetX},${targetY - controlY} ${targetX},${targetY}`;

      return (
        <path
          key={edge.id}
          d={path}
          stroke={selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target) ? "#f472b6" : "#64748b"}
          strokeWidth={selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target) ? "4" : "3"}
          fill="none"
          strokeLinecap="round"
          className="transition-all duration-300 opacity-60 hover:opacity-100"
        />
      );
    });
  }, [visibleEdges, visibleNodes, selectedNodeIds]);

  const singleSelectedNode = useMemo(() => {
    if (selectedNodeIds.size === 1) {
        const id = Array.from(selectedNodeIds)[0];
        return nodes.find(n => n.id === id) || null;
    }
    return null;
  }, [selectedNodeIds, nodes]);

  // Calculate panel position
  const detailPanelPosition = useMemo(() => {
    if (!singleSelectedNode) return null;
    
    // Approximated Node dimensions
    const nodeWidth = 256; 
    const panelWidth = 320; 

    const nodeScreenX = singleSelectedNode.position.x * viewport.scale + viewport.x;
    const nodeScreenY = singleSelectedNode.position.y * viewport.scale + viewport.y;

    // Default: Right side of node
    let x = nodeScreenX + (nodeWidth * viewport.scale) + 20;
    let y = nodeScreenY;

    // Boundary check (Horizontal)
    if (x + panelWidth > window.innerWidth) {
        // Place on left side
        x = nodeScreenX - panelWidth - 20;
    }
    
    // Boundary check (Vertical)
    const maxY = window.innerHeight - 500; 
    if (y < 80) y = 80;
    if (y > maxY) y = maxY;
    
    return { x, y };
  }, [singleSelectedNode, viewport]);


  return (
    <div 
        className="relative w-screen h-screen overflow-hidden bg-background text-white font-sans selection:bg-primary/30 cursor-crosshair"
        onMouseDown={handlePanStart}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      
      {/* Background Grid - Stays fixed but moves pattern based on viewport for infinite feel */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #334155 1px, transparent 0)',
          backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`
        }}
      />

      {/* Empty State */}
      {nodes.length === 0 && <ZenState texts={{ title: t.zenTitle, subtitle: t.zenSubtitle, hint: t.zenHint }} />}

      {/* Viewport Transform Container */}
      <div 
         className="absolute top-0 left-0 w-full h-full origin-top-left"
         style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
          {/* Edges Layer */}
          <svg className="absolute top-0 left-0 w-[50000px] h-[50000px] pointer-events-none z-0 -translate-x-[25000px] -translate-y-[25000px]">
            <g transform="translate(25000, 25000)">
                {renderEdges}
            </g>
          </svg>

          {/* Nodes Layer */}
          <div className="absolute top-0 left-0 w-0 h-0 z-10">
            {visibleNodes.map(node => (
              <NodeItem
                key={node.id}
                node={node}
                scale={viewport.scale}
                isSelected={selectedNodeIds.has(node.id)}
                hasChildren={edges.some(e => e.source === node.id)} // Check if node has children
                onNodeClick={handleNodeClick}
                onUpdatePosition={updateNodePosition}
                onHeightChange={updateNodeHeight}
                onToggleStatus={toggleNodeStatus}
                onToggleCollapse={toggleNodeCollapse}
                onBreakdown={handleBreakdown}
                onDelete={deleteNode}
                isProcessing={processingId === node.id}
                texts={{ breakdown: t.breakdown, archiveTooltip: t.archiveTooltip }}
              />
            ))}
          </div>
      </div>

      {/* Detail Panel (Single Selection) */}
      {singleSelectedNode && detailPanelPosition && (
          <NodeDetailPanel
            key={singleSelectedNode.id} // Re-mount on node change to reset position
            initialX={detailPanelPosition.x}
            initialY={detailPanelPosition.y}
            node={singleSelectedNode}
            lang={lang}
            onUpdate={updateNodeText}
            onToggleStatus={toggleNodeStatus}
            onDelete={deleteNode}
            onSelectDownstream={selectDownstreamFromNode}
            onClose={() => setSelectedNodeIds(new Set())}
          />
      )}

      {/* Bulk Selection Toolbar (Multiple Selection) */}
      {selectedNodeIds.size > 1 && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur border border-accent/30 p-2 rounded-xl shadow-2xl z-40 flex gap-2 animate-pulse-slow">
             <div className="flex items-center px-2 border-r border-white/10 text-xs font-mono text-accent">
                {selectedNodeIds.size} SELECTED
             </div>
             <button 
                onClick={(e) => { e.stopPropagation(); chainSelectedNodes(); }}
                className="hover:bg-accent/20 px-3 py-1 rounded text-xs text-white font-mono flex items-center gap-1 transition-colors"
                title={t.chainNodes}
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                CHAIN
             </button>
             <button 
                onClick={(e) => { e.stopPropagation(); selectDownstream(); }}
                className="hover:bg-primary/20 px-3 py-1 rounded text-xs text-white font-mono flex items-center gap-1 transition-colors"
                title={t.selectDownstream}
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                </svg>
             </button>
             <button 
                onClick={(e) => { e.stopPropagation(); deleteSelectedNodes(); }}
                className="hover:bg-red-500/20 px-3 py-1 rounded text-xs text-red-300 hover:text-red-200 font-mono flex items-center gap-1 transition-colors"
                title={t.deleteSelected}
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
             </button>
          </div>
      )}

      {/* UI Overlay: Header & Stats */}
      <div className="fixed top-0 left-0 p-6 z-50 w-full max-w-sm pointer-events-none">
         <div className="bg-surface/90 backdrop-blur border border-white/10 p-4 rounded-2xl shadow-2xl pointer-events-auto">
            <h1 className="text-xl font-bold font-mono text-primary mb-1 flex items-center gap-2">
              <span className="w-3 h-3 bg-primary rounded-full animate-pulse"></span>
              {t.appTitle}
            </h1>
            <div className="flex justify-between text-xs text-slate-400 mb-4 font-mono">
              <span>{t.statActive}: {activeNodesCount}</span>
              <span>{t.statDone}: {nodes.length - activeNodesCount}</span>
            </div>
            
            <ZenChart data={chartData} texts={{ title: t.chartTitle, active: t.chartActive, done: t.chartDone }} />
         </div>
      </div>

      {/* UI Overlay: Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-8 z-50 flex justify-center pointer-events-none">
        <div className="w-full max-w-2xl bg-surface/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl pointer-events-auto flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDownInput}
            placeholder={t.inputPlaceholder}
            className="flex-1 bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 font-mono transition-colors"
          />
          <button
            onClick={() => { addTask(inputValue); setInputValue(''); }}
            disabled={!inputValue.trim()}
            className="bg-primary hover:bg-primary/90 text-background font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm whitespace-nowrap"
          >
            {t.btnAdd}
          </button>
          
          {/* Auto Align Button */}
          {nodes.length > 0 && (
             <button
                onClick={handleAutoAlign}
                className="bg-surface hover:bg-surface/80 border border-white/10 text-slate-300 p-3 rounded-xl transition-colors ml-2"
                title={t.autoAlign}
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
             </button>
          )}
        </div>
      </div>

      {/* Settings & Help Buttons (Top Right) */}
      <div className="fixed top-6 right-6 z-50 flex flex-col items-end gap-2">
          {/* Settings Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-3 bg-surface/50 backdrop-blur hover:bg-surface border border-white/10 hover:border-white/30 rounded-full text-slate-400 hover:text-white transition-all shadow-lg"
            title={t.settingsTitle}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          {/* Help/Controls Button & Panel */}
          <div className="relative flex flex-col items-end gap-2">
             <button 
                onClick={() => setIsHelpOpen(!isHelpOpen)}
                className={`p-3 backdrop-blur border border-white/10 hover:border-white/30 rounded-full transition-all shadow-lg ${isHelpOpen ? 'bg-surface text-primary border-primary/50' : 'bg-surface/50 text-slate-400 hover:text-white'}`}
                title="Help / Controls"
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
             </button>
             
             {isHelpOpen && (
                 <div className="absolute top-full right-0 mt-2 w-64 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl text-xs text-slate-300 font-mono leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    <h3 className="font-bold text-white mb-2 pb-2 border-b border-white/10 flex items-center gap-2">
                        <span className="text-primary">⌘</span> CONTROLS
                    </h3>
                    <ul className="space-y-2">
                        {t.controls.replace("Controls: ", "").replace("操作: ", "").split(" • ").map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 shrink-0"></span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                 </div>
             )}
          </div>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentLang={lang}
        onLanguageChange={setLang}
        apiKeyStatus={!!process.env.API_KEY}
        onExport={handleExport}
        onImport={handleImport}
      />

    </div>
  );
}

export default App;