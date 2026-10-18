export interface ToolPresentation {
  short: string;
  description: string;
  stat?: string;
  previews: string[];
  error?: boolean;
  cancelled?: boolean;
  /** A launched task that has not reported completion; the call itself has returned. */
  pending?: boolean;
  limit?: number;
  errorPreview?: string[];
}

export interface PresenterInput {
  name: string;
  base: string;
  args: any;
  result: any;
  details: any;
  output: string;
  outputLines: string[];
  cwd: string;
}

export type Presenter = (input: PresenterInput) => ToolPresentation | undefined;
