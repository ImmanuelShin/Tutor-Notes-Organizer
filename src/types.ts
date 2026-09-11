export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
export type StudentFileOpen = "canvas" | "window";
export type ResourceFileOpen = "same" | "window";

export interface Student {
  id: number;
  name: string;
  subject: string;
  level: string;
  contact: string;
  tags: string;
  notes: string;
  worksheet?: string;
  page_layout?: string;
  session_started_at?: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
  last_session?: string | null;
}

export type WorksheetColumn = {
  id: string;
  title: string;
  width: number;
};

export type WorksheetRow = {
  id: string;
  cells: Record<string, string>;
  lastEditedAt?: string;
  done?: boolean;
};

export type Worksheet = {
  columns: WorksheetColumn[];
  rows: WorksheetRow[];
};

export type WorkspaceTabKind = "table" | "notes" | "checklist";

export type NoteBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  body: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type WorkspaceTab = {
  id: string;
  title: string;
  kind: WorkspaceTabKind;
  table?: Worksheet;
  notes?: NoteBox[];
  checklist?: ChecklistItem[];
};

export type Workspace = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  extras?: Record<string, Workspace>;
};

export type TemplateKind = "checklist";

export type ChecklistTemplateItem = {
  text: string;
};

export type ChecklistTemplateBody = {
  items: ChecklistTemplateItem[];
};

export interface Template {
  id: number;
  kind: TemplateKind;
  title: string;
  subject: string;
  body: string;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PagePanelId =
  | "workspace"
  | "sessions"
  | "activeTopics"
  | "profile"
  | "resources"
  | "assignments";

export type PagePanelKind = PagePanelId | "media";

export type PagePanel = {
  id: string;
  kind: PagePanelKind;
  resourceId?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
  z: number;
};

export type StudentPageLayout = {
  zoom: number;
  panX: number;
  panY: number;
  panels: PagePanel[];
};

export interface Session {
  id: number;
  student_id: number;
  occurred_at: string;
  duration_minutes: number | null;
  notes: string;
  homework: string;
  created_at: string;
}

export interface Topic {
  id: number;
  title: string;
  subject: string;
  description: string;
  tags: string;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  sub_unit_count?: number;
}

export interface SubUnit {
  id: number;
  topic_id: number;
  title: string;
  sort_order: number;
}

export interface LearningGoal {
  id: number;
  sub_unit_id: number;
  text: string;
  sort_order: number;
  completed?: number;
}

export interface Assessment {
  id: number;
  sub_unit_id: number;
  text: string;
  sort_order: number;
}

export interface ExampleProblem {
  id: number;
  sub_unit_id: number;
  title: string;
  body: string;
  sort_order: number;
}

export interface StudentTopic {
  id: number;
  student_id: number;
  topic_id: number;
  status: "in_progress" | "completed" | "paused";
  applied_at: string;
  title?: string;
  subject?: string;
}

export type ResourceType = "pdf" | "link" | "lecture_note" | "image";

export interface Resource {
  id: number;
  type: ResourceType;
  title: string;
  tags: string;
  url: string | null;
  file_path: string | null;
  body: string;
  owner_student_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceLink {
  id: number;
  resource_id: number;
  student_id: number | null;
  topic_id: number | null;
  pinned: number;
}

export interface SearchHit {
  kind: "student" | "topic" | "resource" | "template";
  id: number;
  title: string;
  subtitle: string;
}

export interface GoalProgress {
  id: number;
  text: string;
  sort_order: number;
  completed: number;
}

export interface SubUnitProgress {
  id: number;
  title: string;
  sort_order: number;
  goals: GoalProgress[];
  assessments: { id: number; text: string }[];
}

export interface TopicProgress {
  topic_id: number;
  title: string;
  subject: string;
  status: StudentTopic["status"];
  sub_units: SubUnitProgress[];
}

export const EMPTY_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';
