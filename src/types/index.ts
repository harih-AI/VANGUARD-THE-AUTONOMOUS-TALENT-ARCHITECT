// ─── Candidate & Resume Types ─────────────────────────────────
export interface Candidate {
    fileName: string;
    name: string;
    email: string;
    phone: string;
    skills: string[];
    education: string;
    experience: string;
}

export interface ExtractionResult {
    success: boolean;
    data?: Candidate;
    error?: string;
    filePath: string;
}

// ─── Hackathon Types ──────────────────────────────────────────
export interface Hackathon {
    id: string;
    title: string;
    description: string;
    deadline: string;           // ISO date string
    createdAt: string;
    createdBy: string;
    status: 'active' | 'closed' | 'evaluating' | 'completed';
}

// ─── Submission Types ─────────────────────────────────────────
export interface Submission {
    id: string;
    hackathonId: string;
    candidateEmail: string;
    candidateName: string;
    githubRepoUrl: string;
    submittedAt: string;
    status: 'pending' | 'evaluating' | 'evaluated' | 'error';
    evaluationId?: string;
}

// ─── Evaluation Types ─────────────────────────────────────────
export interface EvaluationReport {
    id: string;
    submissionId: string;
    hackathonId: string;
    candidateEmail: string;
    codeQualityScore: number;     // 0-100
    readmeClarityScore: number;   // 0-100
    projectStructureScore: number;// 0-100
    innovationScore: number;      // 0-100
    technicalScore: number;       // 0-100
    overallScore: number;         // 0-100
    rank?: number;
    feedback: EvaluationFeedback;
    evaluatedAt: string;
}

export interface EvaluationFeedback {
    codeQuality: string;
    readmeClarity: string;
    projectStructure: string;
    innovation: string;
    technical: string;
    summary: string;
}

// ─── Admin / Auth Types ───────────────────────────────────────
export interface AdminUser {
    id: string;
    username: string;
    passwordHash: string;
    role: 'hr_admin' | 'evaluator';
    createdAt: string;
}

// ─── Email Types ──────────────────────────────────────────────
export interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export interface InvitationContext {
    hackathonTitle: string;
    hackathonDescription: string;
    deadline: string;
    submissionUrl: string;
    candidateName: string;
}

// ─── API Response Types ───────────────────────────────────────
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
