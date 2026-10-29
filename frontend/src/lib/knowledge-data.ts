export type KnowledgeMap = { id:string; name:string; description:string; revision:number; updated_at:string }
export type KnowledgeNode = { id:string; kind:string; title:string; description:string; roadmap_step_id:string|null; source_roadmap_name:string|null; x:number; y:number; status:string|null; mastery:number|null }
export type KnowledgeEdge = { id:string; source:string; target:string; relation:string; description:string }
export type KnowledgeMapData = { map:KnowledgeMap; nodes:KnowledgeNode[]; edges:KnowledgeEdge[]; viewport:{x:number;y:number;zoom:number} }
export type KnowledgeRoadmapRef = { id:string; name:string }
