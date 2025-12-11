import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { breakDownTask } from './services/geminiService';
import { TaskNode, TaskEdge, TaskStatus, Coordinates, NodeType } from './types';
import { NodeItem } from './components/NodeItem';
import { ZenChart } from './components/ZenChart';
import { ZenState } from './components/ZenState';
import { SettingsModal, CloudSettings } from './components/SettingsModal';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { translations, Language } from './translations';

// Helper to generate IDs
const uid = () => Math.random().toString(36).substr(2, 9);

// Storage Keys
const STORAGE_KEY = 'zenflow_autosave_v1';
const SETTINGS_KEY = 'zenflow_settings_v1';

// Helper to load initial data once
const loadInitialData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.error("Failed to load auto-save data", e);
    return null;
  }
};

const getInitialSettings = () => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const defaultCloudSettings: CloudSettings = { 
    provider: 'custom',
    url: '', 
    apiKey: '', 
    authHeader: 'Authorization', 
    method: 'POST',
    jsonPath: '',
    supabaseUrl: '',
    supabaseKey: '',
    tableName: 'zenflow_data',
    slotId: 'default'
};

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface ConnectionState {
  isConnecting: boolean;
  startNodeId: string | null;
  startType: 'source' | 'target' | null;
  currentPos: Coordinates | null;
}

function App() {
  const [initialData] = useState(() => loadInitialData());

  const [nodes, setNodes] = useState<TaskNode[]>(initialData?.nodes || []);
  const [edges, setEdges] = useState<TaskEdge[]>(initialData?.edges || []);
  
  const [inputValue, setInputValue] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  const initialSettings = getInitialSettings();
  const [lang, setLang] = useState<Language>(() => initialSettings?.lang || 'ja');
  
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => {
      const saved = initialSettings?.cloudSettings;
      return { ...defaultCloudSettings, ...saved };
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false); 
  
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  
  const [currentScopeId, setCurrentScopeId] = useState<string | null>(initialData?.currentScopeId || null);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnecting: false,
    startNodeId: null,
    startType: null,
    currentPos: null
  });

  const [viewport, setViewport] = useState<Viewport>(initialData?.viewport || { x: 0, y: 0, scale: 1 });
  
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  const stateRef = useRef({ nodes, edges, currentScopeId, viewport, cloudSettings, lang });

  useEffect(() => {
    stateRef.current = { nodes, edges, currentScopeId, viewport, cloudSettings, lang };
  }, [nodes, edges, currentScopeId, viewport, cloudSettings, lang]);

  const t = translations[lang];

  const [chartData, setChartData] = useState<{ time: string; active: number; done: number }[]>([]);

  useEffect(() => {
    setChartData([{ time: 'Start', active: 0, done: 0 }]);
  }, []);

  useEffect(() => {
    const active = nodes.filter(n => n.status === TaskStatus.PENDING).length;
    const done = nodes.filter(n => n.status === TaskStatus.COMPLETED).length;
    
    setChartData(prev => {
      const newData = [...prev, { time: new Date().toLocaleTimeString(), active, done }];
      if (newData.length > 20) return newData.slice(newData.length - 20);
      return newData;
    });
  }, [nodes.length, nodes]); 

  // --- DATA FLOW ENGINE ---
  useEffect(() => {
      let frameId: number;
      const loop = () => {
          setNodes(currentNodes => {
             const now = Date.now();
             let hasChanges = false;
             
             const updatedNodes = currentNodes.map(node => ({ ...node }));
             const updatedMap = new Map<string, TaskNode>(updatedNodes.map(n => [n.id, n]));

             // Process Producers
             updatedNodes.forEach(node => {
                 if (node.type === 'oscillator') {
                     const freq = node.config?.frequency || 1;
                     const val = (Math.sin(now * 0.001 * freq) + 1) / 2;
                     if (Math.abs((node.value || 0) - val) > 0.01) {
                        node.value = val;
                        hasChanges = true;
                     }
                 } else if (node.type === 'timer') {
                     const intervalSec = node.config?.interval || 1;
                     const period = intervalSec * 1000;
                     const phase = now % period;
                     const val = phase < 200 ? 1 : 0;
                     if (node.value !== val) {
                         node.value = val;
                         hasChanges = true;
                     }
                 }
             });

             // Propagate Data
             edges.forEach(edge => {
                 const source = updatedMap.get(edge.source);
                 const target = updatedMap.get(edge.target);
                 
                 if (source && target && source.value !== undefined) {
                     if (target.type === 'display') {
                         if (target.value !== source.value) {
                             target.value = source.value;
                             hasChanges = true;
                         }
                     } else if (target.type === 'api') {
                        const signal = source.value;
                        const lastSignal = target.config?.lastSignalWasHigh || false;
                        
                        if (signal > 0.5 && !lastSignal && !target.config?.isFetching) {
                           target.config = { ...target.config, isFetching: true, lastSignalWasHigh: true };
                           hasChanges = true;
                           
                           if (target.config?.url) {
                               fetch(target.config.url)
                                .then(res => res.json())
                                .then(data => {
                                    setNodes(prev => prev.map(n => 
                                        n.id === target.id 
                                        ? { ...n, value: data, config: { ...n.config, isFetching: false, lastData: data } } 
                                        : n
                                    ));
                                })
                                .catch(err => {
                                    setNodes(prev => prev.map(n => 
                                        n.id === target.id 
                                        ? { ...n, config: { ...n.config, isFetching: false, lastError: "Failed" } } 
                                        : n
                                    ));
                                });
                           } else {
                               setTimeout(() => {
                                    setNodes(prev => prev.map(n => n.id === target.id ? { ...n, config: { ...n.config, isFetching: false } } : n));
                               }, 500);
                           }
                        } else {
                            if (target.config?.lastSignalWasHigh !== (signal > 0.5)) {
                                target.config = { ...target.config, lastSignalWasHigh: signal > 0.5 };
                                hasChanges = true;
                            }
                        }
                     }
                 }
             });

             return hasChanges ? updatedNodes : currentNodes;
          });
          frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
  }, [edges]);


  // --- SAVE / LOAD ---
  const saveData = useCallback(() => {
    try {
        const data = {
            nodes,
            edges,
            currentScopeId,
            viewport,
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return data;
    } catch (e) {
        console.error("Save failed", e);
        return null;
    }
  }, [nodes, edges, currentScopeId, viewport]);

  useEffect(() => {
    const saveTimer = setTimeout(() => {
        saveData();
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [saveData]);

  useEffect(() => {
      const handleBeforeUnload = () => {
          const { nodes, edges, currentScopeId, viewport } = stateRef.current;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                nodes, edges, currentScopeId, viewport, timestamp: Date.now()
            }));
          } catch (e) {}
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleManualSave = async () => {
      const data = saveData();
      if (data) {
          setIsSaving(true);
          setSyncStatus('syncing');
          
          console.group("ZenFlow Cloud Save Debug");
          console.log("Attempting to save data...", data);
          console.log("Current Settings:", cloudSettings);

          try {
              if (cloudSettings.provider === 'supabase' && cloudSettings.supabaseUrl && cloudSettings.supabaseKey) {
                  const url = `${cloudSettings.supabaseUrl}/rest/v1/${cloudSettings.tableName || 'zenflow_data'}`;
                  console.log("Supabase Request URL:", url);
                  
                  await fetch(url, {
                      method: 'POST',
                      headers: {
                          'apikey': cloudSettings.supabaseKey,
                          'Authorization': `Bearer ${cloudSettings.supabaseKey}`,
                          'Content-Type': 'application/json',
                          'Prefer': 'resolution=merge-duplicates'
                      },
                      body: JSON.stringify([{ id: cloudSettings.slotId || 'default', data }])
                  });
                  setSyncStatus('success');
              } else if (cloudSettings.provider === 'custom' && cloudSettings.url) {
                  // --- AUTO-CORRECTION LOGIC FOR JSONBIN ---
                  let authHeaderName = cloudSettings.authHeader || 'Authorization';
                  let method = cloudSettings.method;

                  // 1. If it's JSONBin, force X-Master-Key if the user left it as Authorization
                  if (cloudSettings.url.includes('jsonbin.io')) {
                      if (authHeaderName === 'Authorization' || !authHeaderName) {
                          authHeaderName = 'X-Master-Key';
                          console.log("Auto-corrected header to X-Master-Key for JSONBin");
                      }
                      
                      // 2. If it's pointing to a specific BIN ID (ends in alphanumeric ID), force PUT
                      if (/\/b\/[a-zA-Z0-9]+$/.test(cloudSettings.url) && method !== 'PUT') {
                           method = 'PUT';
                           console.log("Auto-corrected method to PUT for JSONBin update");
                      }
                  }

                  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                  if (cloudSettings.apiKey) {
                      headers[authHeaderName] = cloudSettings.apiKey;
                  }
                  
                  console.log(`[Custom Provider] ${method} ${cloudSettings.url}`);
                  console.log("Headers:", headers);
                  
                  const response = await fetch(cloudSettings.url, {
                      method: method,
                      headers,
                      body: JSON.stringify(data)
                  });
                  
                  console.log("Response Status:", response.status);
                  
                  if (!response.ok) {
                      const errorText = await response.text();
                      console.error("Response Error Body:", errorText);
                      // ALERT USER ON ERROR
                      alert(`Save Failed (${response.status}):\n${errorText}\n\nCheck your API Key and URL.`);
                      throw new Error(`HTTP error! status: ${response.status}. Details: ${errorText}`);
                  }
                  
                  const resJson = await response.json();
                  console.log("Response Success Body:", resJson);
                  setSyncStatus('success');
              } else {
                  console.warn("No valid provider configured.");
                  setSyncStatus('idle');
              }
          } catch (e) {
              console.error("Cloud save failed:", e);
              setSyncStatus('error');
          } finally {
              console.groupEnd();
          }
          setTimeout(() => { setIsSaving(false); setTimeout(() => setSyncStatus('idle'), 2000); }, 1000);
      }
  };

  const handleManualLoad = async () => {
      if (window.confirm(t.loadConfirm)) {
          setIsLoading(true);
          setSyncStatus('syncing');
          let loadedData = null;
          try {
              if (cloudSettings.provider === 'supabase' && cloudSettings.supabaseUrl && cloudSettings.supabaseKey) {
                   const url = `${cloudSettings.supabaseUrl}/rest/v1/${cloudSettings.tableName || 'zenflow_data'}?id=eq.${cloudSettings.slotId || 'default'}&select=data`;
                   const res = await fetch(url, {
                       headers: { 'apikey': cloudSettings.supabaseKey, 'Authorization': `Bearer ${cloudSettings.supabaseKey}` }
                   });
                   if (res.ok) {
                       const rows = await res.json();
                       if (rows.length > 0 && rows[0].data) loadedData = rows[0].data;
                   }
              } else if (cloudSettings.provider === 'custom' && cloudSettings.url) {
                  let headers: Record<string, string> = {};
                  let authHeaderName = cloudSettings.authHeader || 'Authorization';
                  if (cloudSettings.url.includes('jsonbin.io') && (authHeaderName === 'Authorization' || !authHeaderName)) {
                      authHeaderName = 'X-Master-Key';
                  }

                  if (cloudSettings.apiKey) headers[authHeaderName] = cloudSettings.apiKey;
                  
                  const res = await fetch(cloudSettings.url, { headers });
                  if (res.ok) {
                      let data = await res.json();
                      if (cloudSettings.jsonPath && data) data = data[cloudSettings.jsonPath];
                      loadedData = data;
                  } else {
                      const err = await res.text();
                      alert(`Load Failed (${res.status}):\n${err}`);
                  }
              }
              setSyncStatus('success');
          } catch (e) {
              console.error(e);
              setSyncStatus('error');
          }

          if (!loadedData) loadedData = loadInitialData();

          if (loadedData) {
              setNodes(loadedData.nodes || []);
              setEdges(loadedData.edges || []);
              setCurrentScopeId(loadedData.currentScopeId || null);
              setViewport(loadedData.viewport || { x: 0, y: 0, scale: 1 });
              setSelectedNodeIds(new Set());
          }
          setTimeout(() => { setIsLoading(false); setTimeout(() => setSyncStatus('idle'), 2000); }, 1000);
      }
  };

  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lang, cloudSettings }));
  }, [lang, cloudSettings]);

  const handleExport = useCallback(() => {
    const { nodes, edges, viewport, currentScopeId, cloudSettings, lang } = stateRef.current;
    
    // Include settings in export
    const data = { 
        version: 1, 
        timestamp: Date.now(), 
        nodes, 
        edges, 
        viewport, 
        currentScopeId,
        settings: {
            lang,
            cloudSettings
        }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `zenflow_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }, []);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && Array.isArray(json.nodes)) {
            setNodes(json.nodes);
            setEdges(json.edges || []);
            setCurrentScopeId(json.currentScopeId || null);
            setViewport(json.viewport || { x: 0, y: 0, scale: 1 });
            
            // Restore settings if present
            if (json.settings) {
                if (json.settings.lang) setLang(json.settings.lang);
                if (json.settings.cloudSettings) setCloudSettings(json.settings.cloudSettings);
            }

            setSelectedNodeIds(new Set());
            setIsSettingsOpen(false); 
        } else {
            alert("Invalid file");
        }
      } catch (err) {
        alert("Load failed");
      }
    };
    reader.readAsText(file);
  }, []);

  // --- ACTIONS ---
  const addTask = (label: string, type: NodeType = 'task') => {
    if (type === 'task' && !label.trim()) return null;
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.scale;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.scale;
    const newNode: TaskNode = {
      id: uid(),
      type,
      label: type === 'task' ? label : type.toUpperCase(),
      status: TaskStatus.PENDING,
      position: { x: centerX - 128 + (Math.random()*100-50), y: centerY - 100 + (Math.random()*100-50) },
      createdAt: Date.now(),
      parentId: currentScopeId || undefined,
      config: type === 'oscillator' ? { frequency: 1 } 
             : type === 'timer' ? { interval: 2 }
             : type === 'api' ? { url: '', method: 'GET' } : {},
      value: type === 'oscillator' || type === 'timer' ? 0 : undefined
    };
    setNodes(prev => [...prev, newNode]);
    return newNode;
  };

  const handleKeyDownInput = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTask(inputValue, 'task');
      setInputValue('');
    }
  };

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, position: { x, y } } : n));
  }, []);
  
  const updateNodeHeight = useCallback((id: string, height: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, height } : n));
  }, []);

  const updateNodeText = useCallback((id: string, label: string, description: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, label, description } : n));
  }, []);

  const updateNodeConfig = useCallback((id: string, config: any) => {
      setNodes(prev => prev.map(n => n.id === id ? { ...n, config: { ...n.config, ...config } } : n));
  }, []);

  const toggleNodeStatus = useCallback((id: string) => {
    setNodes(prev => prev.map(n => 
      n.id === id 
        ? { ...n, status: n.status === TaskStatus.PENDING ? TaskStatus.COMPLETED : TaskStatus.PENDING } 
        : n
    ));
  }, []);
  
  const toggleNodeCollapse = useCallback((id: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, collapsed: !n.collapsed } : n));
  }, []);

  const deleteNode = useCallback((id: string) => {
    const getAllChildren = (nodeId: string): string[] => {
        const children = nodes.filter(n => n.parentId === nodeId);
        let ids = [nodeId];
        children.forEach(c => { ids = [...ids, ...getAllChildren(c.id)]; });
        return ids;
    };
    const idsToDelete = getAllChildren(id);
    setNodes(prev => prev.filter(n => !idsToDelete.includes(n.id)));
    setEdges(prev => prev.filter(e => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)));
    setSelectedNodeIds(prev => {
        const newSet = new Set(prev);
        idsToDelete.forEach(did => newSet.delete(did));
        return newSet;
    });
  }, [nodes]); 

  const deleteSelectedNodes = () => {
    const idsToDelete = Array.from(selectedNodeIds);
    setNodes(prev => prev.filter(n => !idsToDelete.includes(n.id)));
    setEdges(prev => prev.filter(e => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)));
    setSelectedNodeIds(new Set());
  };

  const handleNodeClick = (id: string, e: React.MouseEvent) => {
    if (e.altKey) {
        const treeNodes = getDownstreamNodes([id], selectedNodeIds);
        setSelectedNodeIds(treeNodes);
    } else if (e.ctrlKey || e.metaKey || e.shiftKey) {
        setSelectedNodeIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
            return newSet;
        });
    } else {
        setSelectedNodeIds(prev => prev.has(id) ? prev : new Set([id]));
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
    // Sort logic
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selectedNodes.forEach(n => {
        minX = Math.min(minX, n.position.x); maxX = Math.max(maxX, n.position.x);
        minY = Math.min(minY, n.position.y); maxY = Math.max(maxY, n.position.y);
    });
    const isHorizontal = (maxX - minX) > (maxY - minY);
    selectedNodes.sort((a, b) => isHorizontal ? a.position.x - b.position.x : a.position.y - b.position.y);

    const newEdges = [...edges];
    for (let i = 0; i < selectedNodes.length - 1; i++) {
        const source = selectedNodes[i], target = selectedNodes[i+1];
        if (!newEdges.some(e => e.source === source.id && e.target === target.id)) {
            newEdges.push({ id: uid(), source: source.id, target: target.id });
        }
    }
    setEdges(newEdges);
    
    // Auto position
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

  const handleAutoAlign = useCallback(() => {
    // Restore Dependency-based alignment
    const nodesInScope = nodes.filter(n => currentScopeId === null ? !n.parentId : n.parentId === currentScopeId);
    
    const targetNodeIds = selectedNodeIds.size > 0 
        ? Array.from(selectedNodeIds) 
        : nodesInScope.map(n => n.id);
        
    if (targetNodeIds.length === 0) return;

    const targetNodes = nodes.filter(n => targetNodeIds.includes(n.id));
    const targetSet = new Set(targetNodeIds);
    
    // Only consider edges where both nodes are in the target set
    const relevantEdges = edges.filter(e => targetSet.has(e.source) && targetSet.has(e.target));
    
    // Calculate In-Degrees
    const inDegree = new Map<string, number>();
    targetNodes.forEach(n => inDegree.set(n.id, 0));
    relevantEdges.forEach(e => {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    // Find Roots (In-Degree 0)
    const roots = targetNodes.filter(n => (inDegree.get(n.id) || 0) === 0);
    
    // If no roots (cycles), pick the first one arbitrarily
    if (roots.length === 0 && targetNodes.length > 0) {
        roots.push(targetNodes[0]);
    }

    // BFS to assign Depth
    const depthMap = new Map<string, number>();
    const queue = roots.map(n => ({ id: n.id, depth: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        
        // Max depth logic (keep deepest for structure)
        if (!depthMap.has(id) || depth > depthMap.get(id)!) {
            depthMap.set(id, depth);
        }

        const children = relevantEdges.filter(e => e.source === id).map(e => e.target);
        children.forEach(cid => {
             queue.push({ id: cid, depth: depth + 1 });
        });
    }

    // Handle disconnected components that weren't reached (cycles or islands)
    targetNodes.forEach(n => {
        if (!depthMap.has(n.id)) depthMap.set(n.id, 0);
    });

    // Group by Depth
    const levels: Record<number, string[]> = {};
    let maxDepth = 0;
    depthMap.forEach((depth, id) => {
        if (!levels[depth]) levels[depth] = [];
        levels[depth].push(id);
        maxDepth = Math.max(maxDepth, depth);
    });

    // Layout
    const updates = new Map<string, {x: number, y: number}>();
    const HORIZONTAL_SPACING = 300;
    const VERTICAL_SPACING = 200;
    
    // Calculate center of current group to keep them roughly in place
    let avgX = 0, avgY = 0;
    targetNodes.forEach(n => { avgX += n.position.x; avgY += n.position.y; });
    avgX /= targetNodes.length;
    avgY /= targetNodes.length;

    const totalHeight = (maxDepth + 1) * VERTICAL_SPACING;

    Object.entries(levels).forEach(([depthStr, ids]) => {
        const depth = parseInt(depthStr);
        const levelWidth = ids.length * HORIZONTAL_SPACING;
        const startX = avgX - (levelWidth / 2);
        const startY = avgY - (totalHeight / 2) + (depth * VERTICAL_SPACING);

        ids.forEach((id, index) => {
            updates.set(id, {
                x: startX + (index * HORIZONTAL_SPACING),
                y: startY
            });
        });
    });

    setNodes(prev => prev.map(n => {
        const update = updates.get(n.id);
        return update ? { ...n, position: update } : n;
    }));

  }, [nodes, edges, selectedNodeIds, currentScopeId]);

  // --- AI BREAKDOWN ---
  const handleVerticalBreakdown = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setProcessingId(id);
    const siblings = nodes.filter(n => n.parentId === node.parentId && n.id !== id).map(n => n.label);
    const result = await breakDownTask(node.label, siblings, lang, 'vertical');
    
    if (result.subtasks.length > 0) {
       const startY = node.position.y + 250;
       const startX = node.position.x - ((result.subtasks.length - 1) * 300) / 2;
       const newNodes: TaskNode[] = [];
       const newEdges: TaskEdge[] = [];
       
       result.subtasks.forEach((sub, i) => {
           const newId = uid();
           newNodes.push({
               id: newId, type: 'task', label: sub.label, description: sub.description,
               status: TaskStatus.PENDING,
               position: { x: startX + i * 300, y: startY },
               createdAt: Date.now(), parentId: node.id
           });
           newEdges.push({ id: uid(), source: node.id, target: newId });
       });

       result.dependencies.forEach(dep => {
           if (newNodes[dep.fromIndex] && newNodes[dep.toIndex]) {
               newEdges.push({ id: uid(), source: newNodes[dep.fromIndex].id, target: newNodes[dep.toIndex].id });
           }
       });
       
       setNodes(prev => [...prev, ...newNodes]);
       setEdges(prev => [...prev, ...newEdges]);
       setProcessingId(null);
       setCurrentScopeId(node.id); // Auto enter
    } else {
        setProcessingId(null);
    }
  };

  const handleHorizontalBreakdown = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setProcessingId(id);
    const siblings = nodes.filter(n => n.parentId === node.parentId).map(n => n.label);
    const result = await breakDownTask(node.label, siblings, lang, 'horizontal');

    if (result.subtasks.length > 0) {
       const startX = node.position.x + 350;
       const newNodes: TaskNode[] = [];
       const newEdges: TaskEdge[] = [];
       
       result.subtasks.forEach((sub, i) => {
           const newId = uid();
           newNodes.push({
               id: newId, type: 'task', label: sub.label, description: sub.description,
               status: TaskStatus.PENDING,
               position: { x: startX + i * 350, y: node.position.y },
               createdAt: Date.now(), parentId: node.parentId
           });
       });
       
       // Chain them
       if (newNodes.length > 0) {
           newEdges.push({ id: uid(), source: node.id, target: newNodes[0].id });
           for(let i=0; i<newNodes.length-1; i++) {
               newEdges.push({ id: uid(), source: newNodes[i].id, target: newNodes[i+1].id });
           }
       }

       setNodes(prev => [...prev, ...newNodes]);
       setEdges(prev => [...prev, ...newEdges]);
    }
    setProcessingId(null);
  };

  // --- MOUSE & VIEWPORT ---
  useEffect(() => {
    let animationFrameId: number;
    const updateMovement = () => {
        let dx = 0, dy = 0;
        const speed = 10 / viewport.scale;
        if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) dy += speed;
        if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) dy -= speed;
        if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) dx += speed;
        if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) dx -= speed;
        if (dx !== 0 || dy !== 0) setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        animationFrameId = requestAnimationFrame(updateMovement);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        keysPressed.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    animationFrameId = requestAnimationFrame(updateMovement);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        cancelAnimationFrame(animationFrameId);
    };
  }, [viewport.scale]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // IMPORTANT: Ignore inputs/textareas to allow focus/typing
    if ((e.target as HTMLElement).closest('input, textarea, button, select, label')) return;

    if (e.button === 0 || e.button === 1) {
        e.preventDefault(); 
        setIsPanning(true);
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        setSelectedNodeIds(new Set());
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning && lastPanRef.current) {
        const dx = e.clientX - lastPanRef.current.x;
        const dy = e.clientY - lastPanRef.current.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
    if (connectionState.isConnecting) {
        const worldX = (e.clientX - viewport.x) / viewport.scale;
        const worldY = (e.clientY - viewport.y) / viewport.scale;
        setConnectionState(prev => ({ ...prev, currentPos: { x: worldX, y: worldY } }));
    }
  }, [isPanning, connectionState.isConnecting, viewport]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    lastPanRef.current = null;
    if (connectionState.isConnecting) {
        if (connectionState.startType === 'source' && connectionState.startNodeId && connectionState.currentPos) {
            const newNodeId = uid();
            const newNode: TaskNode = {
                id: newNodeId, type: 'task', label: "New Task", status: TaskStatus.PENDING,
                position: { x: connectionState.currentPos.x - 128, y: connectionState.currentPos.y },
                createdAt: Date.now(), parentId: currentScopeId || undefined
            };
            const newEdge: TaskEdge = { id: uid(), source: connectionState.startNodeId, target: newNodeId };
            setNodes(prev => [...prev, newNode]);
            setEdges(prev => [...prev, newEdge]);
            setSelectedNodeIds(new Set([newNodeId]));
        }
        setConnectionState({ isConnecting: false, startNodeId: null, startType: null, currentPos: null });
    }
  }, [connectionState, currentScopeId]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleConnectStart = (id: string, type: 'source' | 'target', e: React.MouseEvent) => {
    e.stopPropagation();
    const worldX = (e.clientX - viewport.x) / viewport.scale;
    const worldY = (e.clientY - viewport.y) / viewport.scale;
    setConnectionState({ isConnecting: true, startNodeId: id, startType: type, currentPos: { x: worldX, y: worldY } });
  };

  const handleConnectEnd = (id: string, type: 'source' | 'target') => {
      if (connectionState.isConnecting && connectionState.startNodeId) {
          const startId = connectionState.startNodeId;
          const endId = id;
          if (startId === endId) {
             setConnectionState({ isConnecting: false, startNodeId: null, startType: null, currentPos: null });
             return;
          }
          let sourceId = '', targetId = '';
          if (connectionState.startType === 'source' && type === 'target') { sourceId = startId; targetId = endId; } 
          else if (connectionState.startType === 'target' && type === 'source') { sourceId = endId; targetId = startId; } 
          else {
              setConnectionState({ isConnecting: false, startNodeId: null, startType: null, currentPos: null });
              return;
          }
          if (!edges.some(e => e.source === sourceId && e.target === targetId)) {
              setEdges(prev => [...prev, { id: uid(), source: sourceId, target: targetId }]);
          }
      }
      setConnectionState({ isConnecting: false, startNodeId: null, startType: null, currentPos: null });
  };

  const handleEnterNode = (id: string) => {
      setCurrentScopeId(id);
      setSelectedNodeIds(new Set());
      setViewport({ x: 0, y: 0, scale: 1 });
  };

  const handleNavigateUp = (targetId: string | null) => {
      setCurrentScopeId(targetId);
      setSelectedNodeIds(new Set());
      setViewport({ x: 0, y: 0, scale: 1 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(viewport.scale * (1 + scaleAmount), 0.1), 5);
    const worldX = (e.clientX - viewport.x) / viewport.scale;
    const worldY = (e.clientY - viewport.y) / viewport.scale;
    const newX = e.clientX - (worldX * newScale);
    const newY = e.clientY - (worldY * newScale);
    setViewport({ x: newX, y: newY, scale: newScale });
  };

  // Helper Logic
  const getDownstreamNodes = useCallback((startIds: string[], currentSet: Set<string> = new Set()) => {
    const queue = [...startIds];
    const result = new Set(currentSet);
    startIds.forEach(id => result.add(id));
    while(queue.length > 0) {
        const currentId = queue.shift()!;
        const children = edges.filter(e => e.source === currentId).map(e => e.target);
        for (const childId of children) {
            if (!result.has(childId)) { result.add(childId); queue.push(childId); }
        }
    }
    return result;
  }, [edges]);

  const breadcrumbs = useMemo(() => {
    const path: TaskNode[] = [];
    let curr = currentScopeId;
    while (curr) {
        const node = nodes.find(n => n.id === curr);
        if (node) { path.unshift(node); curr = node.parentId || null; } else break;
    }
    return path;
  }, [currentScopeId, nodes]);

  const visibleNodes = useMemo(() => {
      return nodes.filter(n => currentScopeId === null ? !n.parentId : n.parentId === currentScopeId);
  }, [nodes, currentScopeId]);

  const visibleEdges = useMemo(() => {
      const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
      return edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
  }, [edges, visibleNodes]);

  const selectedNodeData = useMemo(() => {
      if (selectedNodeIds.size !== 1) return null;
      return nodes.find(n => n.id === Array.from(selectedNodeIds)[0]) || null;
  }, [selectedNodeIds, nodes]);

  // Calculate Node Detail Panel Position (Relative to Node)
  const nodeDetailPosition = useMemo(() => {
      if (!selectedNodeData) return { x: 0, y: 0 };
      
      // Node World Position -> Screen Position
      const screenX = selectedNodeData.position.x * viewport.scale + viewport.x;
      const screenY = selectedNodeData.position.y * viewport.scale + viewport.y;
      
      // Place right to the node (Node Width approx 256px + padding)
      const panelX = screenX + (270 * viewport.scale); 
      const panelY = screenY;

      return { x: panelX, y: panelY };
  }, [selectedNodeData, viewport]);


  return (
    <div 
        className="relative w-screen h-screen overflow-hidden bg-background text-white font-sans selection:bg-primary/30 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : connectionState.isConnecting ? 'crosshair' : 'default' }}
    >
      
      {/* Background Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #334155 1px, transparent 0)',
          backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`
        }}
      />

      {/* Zen State Background */}
      {visibleNodes.length === 0 && (
          <ZenState texts={{ title: t.zenTitle, subtitle: t.zenSubtitle, hint: t.zenHint }} />
      )}

      {/* Chart (Top Left) */}
      <div className="absolute top-6 left-6 w-64 z-40 pointer-events-none select-none">
          <ZenChart data={chartData} texts={{ title: t.chartTitle, active: t.chartActive, done: t.chartDone }} />
          <div className="mt-2 flex gap-4 text-xs font-mono">
             <div className="text-primary">{t.statActive}: {chartData[chartData.length-1]?.active}</div>
             <div className="text-success">{t.statDone}: {chartData[chartData.length-1]?.done}</div>
          </div>
      </div>

      {/* Breadcrumbs (Top Center) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-2 z-40">
        <button 
            onClick={() => handleNavigateUp(null)}
            className={`px-3 py-1 rounded-full text-xs font-mono border transition-all ${currentScopeId === null ? 'bg-white/10 text-white border-white/20' : 'bg-black/40 text-slate-400 border-white/5 hover:bg-white/5'}`}
        >
            {t.root}
        </button>
        {breadcrumbs.map((node, i) => (
            <React.Fragment key={node.id}>
                <span className="text-slate-600">/</span>
                <button 
                    onClick={() => handleNavigateUp(node.id)}
                    className={`px-3 py-1 rounded-full text-xs font-mono border transition-all ${i === breadcrumbs.length - 1 ? 'bg-white/10 text-white border-white/20' : 'bg-black/40 text-slate-400 border-white/5 hover:bg-white/5'}`}
                >
                    {node.label}
                </button>
            </React.Fragment>
        ))}
      </div>

      {/* Canvas Content */}
      <div 
        className="absolute inset-0 origin-top-left will-change-transform"
        style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
        }}
      >
        {/* SVG Edges */}
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-0">
           {visibleEdges.map(edge => {
               const source = nodes.find(n => n.id === edge.source);
               const target = nodes.find(n => n.id === edge.target);
               if (!source || !target) return null;
               
               const sx = source.position.x + 128; // Center of 256px wide node
               const sy = source.position.y + (source.height || 100); // Bottom
               const tx = target.position.x + 128; // Center
               const ty = target.position.y; // Top

               // Bezier Curve
               const d = `M ${sx} ${sy} C ${sx} ${sy + 50}, ${tx} ${ty - 50}, ${tx} ${ty}`;
               
               // Logic flow animation
               const isActive = source.value !== undefined && (typeof source.value === 'number' ? source.value > 0.1 : !!source.value);

               return (
                   <g key={edge.id}>
                        <path d={d} stroke="#334155" strokeWidth="2" fill="none" />
                        {isActive && (
                             <path d={d} stroke={source.type === 'oscillator' ? '#06b6d4' : source.type === 'timer' ? '#10b981' : '#38bdf8'} strokeWidth="2" fill="none" strokeDasharray="10,10">
                                 <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                             </path>
                        )}
                   </g>
               );
           })}
           
           {/* Connection Line */}
           {connectionState.isConnecting && connectionState.currentPos && connectionState.startNodeId && (
               (() => {
                   const startNode = nodes.find(n => n.id === connectionState.startNodeId);
                   if (!startNode) return null;
                   
                   let sx, sy, tx, ty;
                   
                   if (connectionState.startType === 'source') {
                       sx = startNode.position.x + 128;
                       sy = startNode.position.y + (startNode.height || 100);
                       tx = connectionState.currentPos.x;
                       ty = connectionState.currentPos.y;
                   } else {
                       sx = connectionState.currentPos.x;
                       sy = connectionState.currentPos.y;
                       tx = startNode.position.x + 128;
                       ty = startNode.position.y;
                   }

                   const d = `M ${sx} ${sy} C ${sx} ${sy + 50}, ${tx} ${ty - 50}, ${tx} ${ty}`;
                   return <path d={d} stroke="#f472b6" strokeWidth="2" strokeDasharray="5,5" fill="none" className="animate-pulse" />;
               })()
           )}
        </svg>

        {/* Nodes */}
        {visibleNodes.map(node => (
            <NodeItem
                key={node.id}
                node={node}
                scale={viewport.scale}
                isSelected={selectedNodeIds.has(node.id)}
                hasChildren={nodes.some(n => n.parentId === node.id)}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleEnterNode}
                onUpdatePosition={updateNodePosition}
                onHeightChange={updateNodeHeight}
                onToggleStatus={toggleNodeStatus}
                onToggleCollapse={toggleNodeCollapse}
                onConnectStart={handleConnectStart}
                onConnectEnd={handleConnectEnd}
                onVerticalBreakdown={handleVerticalBreakdown}
                onHorizontalBreakdown={handleHorizontalBreakdown}
                onDelete={deleteNode}
                onConfigChange={updateNodeConfig}
                isProcessing={processingId === node.id}
                texts={{
                    breakdown: t.breakdown,
                    horizontalBreakdown: t.horizontalBreakdown,
                    archiveTooltip: t.archiveTooltip,
                    enterNode: t.enterNode,
                    frequency: t.frequency,
                    interval: t.interval,
                    seconds: t.seconds,
                    fetch: t.fetch,
                    fetching: t.fetching,
                    url: t.url
                }}
            />
        ))}
      </div>

      {/* Bottom Input Bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4">
         <div className="bg-surface/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-2">
             <div className="flex gap-2">
                <input 
                    type="text" 
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDownInput}
                    placeholder={t.inputPlaceholder}
                    className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 transition-colors font-mono"
                />
                <button 
                    onClick={() => { addTask(inputValue, 'task'); setInputValue(''); }}
                    disabled={!inputValue.trim()}
                    className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl px-6 font-bold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {t.btnAdd}
                </button>
             </div>
             
             {/* Tools */}
             <div className="flex justify-between items-center px-1">
                 <div className="flex gap-1">
                     <button onClick={() => addTask('OSC', 'oscillator')} className="p-2 rounded hover:bg-white/5 text-cyan-400" title={t.addOscillator}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                     </button>
                     <button onClick={() => addTask('TIME', 'timer')} className="p-2 rounded hover:bg-white/5 text-emerald-400" title={t.addTimer}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     </button>
                     <button onClick={() => addTask('API', 'api')} className="p-2 rounded hover:bg-white/5 text-purple-400" title={t.addApi}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                     </button>
                     <button onClick={() => addTask('DISP', 'display')} className="p-2 rounded hover:bg-white/5 text-yellow-400" title={t.addDisplay}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                     </button>
                 </div>
                 
                 <div className="w-px h-6 bg-white/10 mx-2"></div>

                 <div className="flex gap-1">
                    <button onClick={handleAutoAlign} className="p-2 rounded hover:bg-white/5 text-slate-400 hover:text-white" title={t.autoAlign}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                    {selectedNodeIds.size > 0 && (
                        <>
                         <button onClick={deleteSelectedNodes} className="p-2 rounded hover:bg-red-500/20 text-red-400" title={t.deleteSelected}>
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                         {selectedNodeIds.size > 1 && (
                            <button onClick={chainSelectedNodes} className="p-2 rounded hover:bg-white/5 text-accent" title={t.chainNodes}>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            </button>
                         )}
                        </>
                    )}
                 </div>
             </div>
         </div>
      </div>
      
      {/* Settings, Help & Save Buttons */}
      <div 
         className="fixed top-6 right-6 z-50 flex flex-col items-end gap-2"
         onMouseDown={(e) => e.stopPropagation()}
      >
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
          
          {/* Help Button */}
          <div className="relative">
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
                 <div className="absolute right-full top-0 mr-4 w-64 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl text-xs text-slate-300 font-mono leading-relaxed animate-in fade-in slide-in-from-right-4 duration-200">
                    <h3 className="font-bold text-white mb-2 pb-2 border-b border-white/10 flex items-center gap-2">
                        <span className="text-primary">CMD</span> CONTROLS
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

          {/* Manual Save Button */}
          <button
              onClick={handleManualSave}
              className={`p-3 backdrop-blur border rounded-full transition-all shadow-lg ${
                  isSaving 
                  ? 'bg-success text-surface border-success' 
                  : 'bg-surface/50 text-slate-400 hover:text-white border-white/10 hover:border-white/30'
              }`}
              title={isSaving ? t.saved : t.save}
          >
              {isSaving ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
              ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4h4m-1 4H6m4-8V3h4v4" />
                  </svg>
              )}
          </button>

          {/* Manual Load Button */}
          <button
              onClick={handleManualLoad}
              className={`p-3 backdrop-blur border rounded-full transition-all shadow-lg ${
                  isLoading 
                  ? 'bg-blue-500 text-surface border-blue-500' 
                  : 'bg-surface/50 text-slate-400 hover:text-white border-white/10 hover:border-white/30'
              }`}
              title={isLoading ? t.loaded : t.load}
          >
              {isLoading ? (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                   </svg>
              ) : (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                   </svg>
              )}
          </button>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={handleCloseSettings}
        currentLang={lang}
        onLanguageChange={setLang}
        apiKeyStatus={!!process.env.API_KEY}
        onExport={handleExport}
        onImport={handleImport}
        cloudSettings={cloudSettings}
        onCloudSettingsChange={setCloudSettings}
      />
      
      {/* Node Detail Panel */}
      {selectedNodeData && (
        <NodeDetailPanel 
          node={selectedNodeData}
          lang={lang}
          initialX={nodeDetailPosition.x}
          initialY={nodeDetailPosition.y}
          onUpdate={updateNodeText}
          onToggleStatus={toggleNodeStatus}
          onDelete={deleteNode}
          onSelectDownstream={selectDownstreamFromNode}
          onClose={() => setSelectedNodeIds(new Set())}
        />
      )}

    </div>
  );
}

export default App;