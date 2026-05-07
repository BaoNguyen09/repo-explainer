export type FormResult = {
  explanation: string;
  repo: string;
  timestamp: string;
  cache: boolean;
  default_branch: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
};

export type ChatStatus = {
  stage: string;
  path?: string;
};

export type ChatToolEvent = {
  id: string;
  tool: 'read_file' | 'list_directory' | string;
  path: string;
};

export type ChatStyle = 'normal' | 'caveman';

export type StoredRepoState = {
  version: number;
  repo: string;
  explanation: string;
  defaultBranch: string;
  messages: ChatMessage[];
  style: ChatStyle;
  updatedAt: string;
};

