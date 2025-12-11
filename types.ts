export enum TaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface TaskNode {
  id: string;
  label: string;
  description?: string;
  status: TaskStatus;
  position: Coordinates;
  height?: number; // Added for calculating outlet position
  collapsed?: boolean; // New: determines if downstream nodes are hidden
  parentId?: string; // If it's a subtask
  createdAt: number;
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
