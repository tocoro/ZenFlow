export enum TaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}

export type NodeType = 'task' | 'oscillator' | 'display' | 'api' | 'timer';

export interface Coordinates {
  x: number;
  y: number;
}

export interface TaskNode {
  id: string;
  type: NodeType; // New field to distinguish node behavior
  label: string;
  description?: string;
  status: TaskStatus;
  position: Coordinates;
  height?: number;
  collapsed?: boolean;
  parentId?: string;
  createdAt: number;
  
  // Data Flow Properties
  value?: any; // Current runtime value (output)
  inputs?: any[]; // Values received from upstream
  config?: { // Specific configuration based on type
    frequency?: number; // For Oscillator
    interval?: number; // For Timer (seconds)
    url?: string; // For API
    method?: 'GET' | 'POST'; // For API
    jsonPath?: string; // For API extraction
    isFetching?: boolean; // For API State
    lastSignalWasHigh?: boolean; // For Edge Detection
    [key: string]: any;
  };
}

export interface TaskEdge {
  id: string;
  source: string;
  target: string;
}

export interface AppState {
  nodes: TaskNode[];
  edges: TaskEdge[];
  completedCount: number;
  totalCreatedCount: number;
}

export interface BreakdownResponse {
  subtasks: {
    label: string;
    description: string;
  }[];
  dependencies: {
    fromIndex: number;
    toIndex: number;
  }[];
}