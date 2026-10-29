use axum::{
    extract::{Request, State as HttpState},
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
};
use rand::RngCore;
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerConfig},
    schemars::JsonSchema,
    tool, tool_router,
    transport::{
        streamable_http_server::{
            session::local::LocalSessionManager, tower::StreamableHttpService,
        },
        StreamableHttpServerConfig,
    },
    ServerHandler,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    commands::knowledge::{self, KnowledgeEdge, SaveMapPayload},
    db::Database,
};

tokio::task_local! { static MCP_CLIENT: String; }

fn log_mcp_change(conn: &rusqlite::Connection, operation: &str, summary: &str) {
    let client = MCP_CLIENT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| "local-agent".into());
    let _ = conn.execute(
        "INSERT INTO agent_change_log(id,client,operation,summary) VALUES(?1,?2,?3,?4)",
        params![Uuid::new_v4().to_string(), client, operation, summary],
    );
}

#[derive(Clone)]
struct McpState(Database);
impl std::fmt::Debug for McpState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("McpState").finish()
    }
}
#[derive(Clone, Debug)]
struct StudyTools {
    state: McpState,
    #[allow(dead_code)]
    router: ToolRouter<Self>,
}
impl StudyTools {
    fn new(state: McpState) -> Self {
        Self {
            state,
            router: Self::tool_router(),
        }
    }
}
#[derive(Deserialize, JsonSchema)]
struct SearchArgs {
    #[schemars(description = "Termo opcional para pesquisar trilhas, etapas, tarefas e mapas.")]
    query: String,
}
#[derive(Deserialize, JsonSchema)]
struct RoadmapArgs {
    name: String,
    description: String,
    #[schemars(description = "Etapas ordenadas, título e descrição.")]
    steps: Vec<PlanStep>,
    #[schemars(description = "Tarefas opcionais com título e duração em minutos.")]
    tasks: Option<Vec<PlanTask>>,
    notes: Option<Vec<PlanNote>>,
    #[schemars(description = "Nome de um mapa opcional. Cria um mapa com nós para as etapas.")]
    map_name: Option<String>,
    operation_id: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct PlanStep {
    title: String,
    description: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct PlanTask {
    title: String,
    duration_minutes: Option<i64>,
    step_index: Option<usize>,
}
#[derive(Deserialize, JsonSchema)]
struct PlanNote {
    title: String,
    content: String,
    step_index: Option<usize>,
}
#[derive(Deserialize, JsonSchema)]
struct CreateMapArgs {
    name: String,
    description: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct ConnectArgs {
    map_id: String,
    source_title: String,
    target_title: String,
    relation: String,
    explanation: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct AddStepArgs {
    map_id: String,
    roadmap_step_id: String,
}
#[derive(Deserialize, JsonSchema)]
struct AddConceptArgs {
    map_id: String,
    title: String,
    description: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct ReadMapArgs {
    map_id: String,
}
#[derive(Deserialize, JsonSchema)]
struct NoteArgs {
    title: String,
    content: String,
    map_id: Option<String>,
    node_title: Option<String>,
    target_kind: Option<String>,
    target_id: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct TaskArgs {
    title: String,
    subject: Option<String>,
    duration_minutes: Option<i64>,
    roadmap_step_id: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct ReadItemArgs {
    entity_type: String,
    entity_id: String,
}
#[derive(Deserialize, JsonSchema)]
struct UpdateItemArgs {
    entity_type: String,
    entity_id: String,
    expected_revision: i64,
    operation_id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    mastery: Option<i64>,
    content: Option<String>,
    category: Option<String>,
    subject: Option<String>,
    duration_minutes: Option<i64>,
    done: Option<bool>,
    next_step: Option<String>,
}
#[derive(Deserialize, JsonSchema)]
struct DeleteArgs {
    entity_type: String,
    entity_id: String,
    summary: String,
}

#[tool_router]
impl StudyTools {
    #[tool(
        description = "Pesquise trilhas, etapas, tarefas e mapas existentes. Consulte antes de criar conteúdo para evitar duplicatas."
    )]
    fn search_study(&self, Parameters(SearchArgs { query }): Parameters<SearchArgs>) -> String {
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco de estudos.".into();
        };
        let pattern = format!(
            "%{}%",
            query
                .trim()
                .chars()
                .take(100)
                .collect::<String>()
                .replace('%', "\\%")
        );
        let result=conn.prepare("SELECT 'trilha',id,name,COALESCE(next_step,'') FROM roadmaps WHERE name LIKE ?1 UNION ALL SELECT 'etapa',rs.id,rs.title,r.name FROM roadmap_steps rs JOIN roadmaps r ON r.id=rs.roadmap_id WHERE rs.title LIKE ?1 OR r.name LIKE ?1 UNION ALL SELECT 'tarefa',id,title,subject FROM tasks WHERE title LIKE ?1 UNION ALL SELECT 'mapa',id,name,description FROM knowledge_maps WHERE name LIKE ?1 ORDER BY 1,3 LIMIT 100").and_then(|mut s|s.query_map([pattern],|r|Ok(format!("{} | ID {} | {} — {}",r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?))).and_then(|rows|rows.collect::<Result<Vec<_>,_>>()));
        match result {
            Ok(rows) if rows.is_empty() => "Nenhum conteúdo encontrado.".into(),
            Ok(rows) => rows.join("\n"),
            Err(e) => format!("Falha na busca: {e}"),
        }
    }
    #[tool(
        description = "Crie atomicamente uma trilha de estudo com etapas ordenadas, tarefas opcionais e mapa de conhecimento opcional."
    )]
    fn create_study_plan(&self, Parameters(plan): Parameters<RoadmapArgs>) -> String {
        if plan.steps.is_empty() || plan.steps.len() > 100 {
            return "A trilha precisa ter de 1 a 100 etapas.".into();
        }
        if plan.name.trim().is_empty()
            || plan.name.chars().count() > 100
            || plan
                .steps
                .iter()
                .any(|s| s.title.trim().is_empty() || s.title.chars().count() > 200)
            || plan.tasks.as_ref().is_some_and(|tasks| {
                tasks.len() > 300
                    || tasks.iter().any(|t| {
                        t.title.trim().is_empty()
                            || t.step_index.is_some_and(|i| i >= plan.steps.len())
                    })
            })
            || plan.notes.as_ref().is_some_and(|notes| {
                notes.len() > 200
                    || notes.iter().any(|note| {
                        note.title.trim().is_empty()
                            || note.step_index.is_some_and(|i| i >= plan.steps.len())
                    })
            })
            || plan.map_name.as_ref().is_some_and(|n| n.trim().is_empty())
        {
            return "O plano contém um nome vazio ou uma referência inválida.".into();
        }
        let Ok(mut conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let operation_key = plan.operation_id.as_deref().map(|id| {
            format!(
                "{}:{}",
                MCP_CLIENT
                    .try_with(Clone::clone)
                    .unwrap_or_else(|_| "local-agent".into()),
                id.trim()
            )
        });
        if let Some(key) = operation_key.as_ref() {
            if key.len() > 180 {
                return "O ID da operação excede 180 caracteres.".into();
            }
            if let Ok(existing) = conn.query_row(
                "SELECT result FROM agent_operations WHERE operation_id=?1",
                [key],
                |r| r.get::<_, String>(0),
            ) {
                return existing;
            }
        }
        let tx = match conn.transaction() {
            Ok(v) => v,
            Err(e) => return e.to_string(),
        };
        let roadmap_id = Uuid::new_v4().to_string();
        let code = format!("AI-{}", &roadmap_id[..6]);
        let first = plan.steps.first().map(|s| s.title.as_str()).unwrap_or("");
        if let Err(e) = tx.execute(
            "INSERT INTO roadmaps(id,name,description,code,next_step) VALUES(?1,?2,?3,?4,?5)",
            params![
                roadmap_id,
                plan.name.trim(),
                plan.description.trim(),
                code,
                first
            ],
        ) {
            return format!("Não foi possível criar a trilha: {e}");
        }
        let mut ids = Vec::new();
        for (i, step) in plan.steps.iter().enumerate() {
            let id = Uuid::new_v4().to_string();
            let status = if i == 0 { "available" } else { "locked" };
            if let Err(e)=tx.execute("INSERT INTO roadmap_steps(id,roadmap_id,title,status,sort_order,description,checklist,checklist_state) VALUES(?1,?2,?3,?4,?5,?6,'[\"Compreender os conceitos fundamentais\"]','[false]')",params![id,roadmap_id,step.title.trim(),status,i as i64,step.description.as_deref().unwrap_or("")]){return format!("Etapa inválida: {e}")}
            ids.push(id);
        }
        let mut task_count = 0;
        for task in plan.tasks.unwrap_or_default() {
            let id = Uuid::new_v4().to_string();
            let subject = task
                .step_index
                .and_then(|i| plan.steps.get(i))
                .map(|s| s.title.as_str())
                .unwrap_or(plan.name.as_str());
            if let Err(e)=tx.execute("INSERT INTO tasks(id,title,group_name,subject,duration,priority,due) VALUES(?1,?2,'Próximas',?3,?4,'Média','Hoje')",params![id,task.title.trim(),subject,task.duration_minutes.unwrap_or(25).clamp(1,600)]){return format!("Tarefa inválida: {e}")}
            if let Some(i) = task.step_index {
                if let Some(step_id) = ids.get(i) {
                    let _ = tx.execute(
                        "INSERT INTO study_task_links(task_id,roadmap_step_id) VALUES(?1,?2)",
                        params![id, step_id],
                    );
                }
            }
            task_count += 1;
        }
        let mut note_count = 0;
        for note in plan.notes.unwrap_or_default() {
            let note_id = Uuid::new_v4().to_string();
            if let Err(e) = tx.execute(
                "INSERT INTO notes(id,title,content,category,link) VALUES(?1,?2,?3,'Estudo',?4)",
                params![note_id, note.title.trim(), note.content, plan.name],
            ) {
                return format!("Nota invÃ¡lida: {e}");
            }
            if let Some(index) = note.step_index {
                if let Some(step_id) = ids.get(index) {
                    let _=tx.execute("INSERT INTO knowledge_note_links(note_id,target_kind,target_id) VALUES(?1,'roadmap_step',?2)",params![note_id,step_id]);
                }
            }
            note_count += 1;
        }
        let map_id = if let Some(name) = plan.map_name {
            let id = Uuid::new_v4().to_string();
            if let Err(e) = tx.execute(
                "INSERT INTO knowledge_maps(id,name,description) VALUES(?1,?2,?3)",
                params![id, name.trim(), plan.description],
            ) {
                return format!("Falha ao criar mapa: {e}");
            }
            for (i, step) in plan.steps.iter().enumerate() {
                let _=tx.execute("INSERT INTO knowledge_nodes(id,map_id,kind,title,description,roadmap_step_id,source_roadmap_name,position_x,position_y) VALUES(?1,?2,'roadmap_step',?3,?4,?5,?6,?7,0)",params![Uuid::new_v4().to_string(),id,step.title.trim(),step.description.as_deref().unwrap_or(""),ids[i],plan.name,(i as f64)*220.0]);
            }
            Some(id)
        } else {
            None
        };
        log_mcp_change(
            &tx,
            "create_study_plan",
            &format!(
                "Trilha {} criada com {} etapas, {} tarefas e {} notas",
                plan.name,
                ids.len(),
                task_count,
                note_count
            ),
        );
        let result = format!(
            "Plano de estudo criado: trilha `{}` com {} etapas, {} tarefas, {} notas{}.",
            plan.name,
            ids.len(),
            task_count,
            note_count,
            map_id.map(|id| format!(" e mapa {id}")).unwrap_or_default()
        );
        if let Some(key) = operation_key {
            let client = MCP_CLIENT
                .try_with(Clone::clone)
                .unwrap_or_else(|_| "local-agent".into());
            if let Err(e) = tx.execute(
                "INSERT INTO agent_operations(operation_id,client,result) VALUES(?1,?2,?3)",
                params![key, client, result],
            ) {
                return format!("Falha ao registrar repetição segura: {e}");
            }
        }
        if let Err(e) = tx.commit() {
            return format!("Falha ao salvar plano: {e}");
        }
        result
    }
    #[tool(
        description = "Crie um mapa de conhecimento vazio para conectar assuntos de diferentes trilhas."
    )]
    fn create_knowledge_map(&self, Parameters(args): Parameters<CreateMapArgs>) -> String {
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let id = Uuid::new_v4().to_string();
        match conn.execute(
            "INSERT INTO knowledge_maps(id,name,description) VALUES(?1,?2,?3)",
            params![id, args.name.trim(), args.description.unwrap_or_default()],
        ) {
            Ok(_) => {
                log_mcp_change(&conn, "create_map", &format!("Mapa {} criado", args.name));
                format!("Mapa criado. ID: {id}")
            }
            Err(e) => format!("Falha ao criar mapa: {e}"),
        }
    }
    #[tool(
        description = "Adicione ao mapa uma etapa existente de uma trilha, usando o ID estável da etapa retornado pela busca."
    )]
    fn add_step_to_knowledge_map(&self, Parameters(args): Parameters<AddStepArgs>) -> String {
        let Ok(mut conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let mut map = match knowledge::get_map_db(&conn, &args.map_id) {
            Ok(m) => m,
            Err(_) => return "Mapa não encontrado.".into(),
        };
        if map
            .nodes
            .iter()
            .any(|n| n.roadmap_step_id.as_deref() == Some(&args.roadmap_step_id))
        {
            return "Essa etapa já está no mapa.".into();
        }
        let step = conn.query_row("SELECT rs.title,rs.description,r.name,rs.status,rs.mastery FROM roadmap_steps rs JOIN roadmaps r ON r.id=rs.roadmap_id WHERE rs.id=?1", [&args.roadmap_step_id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?)));
        let Ok((title, description, roadmap, status, mastery)) = step else {
            return "Etapa não encontrada.".into();
        };
        let index = map.nodes.len();
        map.nodes.push(knowledge::KnowledgeNode {
            id: Uuid::new_v4().to_string(),
            kind: "roadmap_step".into(),
            title,
            description,
            roadmap_step_id: Some(args.roadmap_step_id),
            source_roadmap_name: Some(roadmap),
            x: 80.0 + (index % 3) as f64 * 250.0,
            y: 70.0 + (index / 3) as f64 * 155.0,
            status: Some(status),
            mastery: Some(mastery),
        });
        let node_id = map.nodes.last().map(|n| n.id.clone()).unwrap_or_default();
        let revision = match knowledge::save_map_db(
            &mut conn,
            SaveMapPayload {
                map_id: args.map_id,
                expected_revision: map.map.revision,
                nodes: map.nodes,
                edges: map.edges,
                viewport: map.viewport,
            },
        ) {
            Ok(r) => r,
            Err(e) => return e,
        };
        log_mcp_change(
            &conn,
            "add_map_step",
            &format!("Etapa {node_id} adicionada ao mapa"),
        );
        format!("Etapa adicionada. Nó: {node_id}; revisão: {revision}.")
    }
    #[tool(
        description = "Leia um mapa completo, incluindo IDs, assuntos, relações e explicações, antes de propor alterações."
    )]
    fn read_knowledge_map(&self, Parameters(args): Parameters<ReadMapArgs>) -> String {
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        match knowledge::get_map_db(&conn, &args.map_id) {
            Ok(map) => serde_json::to_string_pretty(&map).unwrap_or_else(|e| e.to_string()),
            Err(_) => "Mapa não encontrado.".into(),
        }
    }
    #[tool(description = "Adicione ao mapa um conceito livre com uma descrição opcional.")]
    fn add_concept_to_knowledge_map(&self, Parameters(args): Parameters<AddConceptArgs>) -> String {
        if args.title.trim().is_empty() || args.title.chars().count() > 200 {
            return "O conceito precisa de um título de até 200 caracteres.".into();
        }
        let Ok(mut conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let mut map = match knowledge::get_map_db(&conn, &args.map_id) {
            Ok(m) => m,
            Err(_) => return "Mapa não encontrado.".into(),
        };
        if map
            .nodes
            .iter()
            .any(|n| n.roadmap_step_id.is_none() && n.title.eq_ignore_ascii_case(args.title.trim()))
        {
            return "Esse conceito já existe no mapa.".into();
        }
        let index = map.nodes.len();
        let id = Uuid::new_v4().to_string();
        map.nodes.push(knowledge::KnowledgeNode {
            id: id.clone(),
            kind: "concept".into(),
            title: args.title.trim().into(),
            description: args.description.unwrap_or_default(),
            roadmap_step_id: None,
            source_roadmap_name: None,
            x: 80.0 + (index % 3) as f64 * 250.0,
            y: 70.0 + (index / 3) as f64 * 155.0,
            status: None,
            mastery: None,
        });
        let revision = match knowledge::save_map_db(
            &mut conn,
            SaveMapPayload {
                map_id: args.map_id,
                expected_revision: map.map.revision,
                nodes: map.nodes,
                edges: map.edges,
                viewport: map.viewport,
            },
        ) {
            Ok(r) => r,
            Err(e) => return e,
        };
        log_mcp_change(
            &conn,
            "add_map_concept",
            &format!("Conceito {} criado", args.title),
        );
        format!("Conceito adicionado. Nó: {id}; revisão: {revision}.")
    }
    #[tool(
        description = "Crie uma relação direcionada entre dois assuntos que já existem no mapa. A conexão precisa de um nome e pode ter uma explicação."
    )]
    fn connect_knowledge(&self, Parameters(args): Parameters<ConnectArgs>) -> String {
        let Ok(mut conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let map = match knowledge::get_map_db(&conn, &args.map_id) {
            Ok(m) => m,
            Err(_) => return "Mapa não encontrado.".into(),
        };
        let source = map
            .nodes
            .iter()
            .find(|n| n.title.eq_ignore_ascii_case(args.source_title.trim()));
        let target = map
            .nodes
            .iter()
            .find(|n| n.title.eq_ignore_ascii_case(args.target_title.trim()));
        let (Some(source), Some(target)) = (source, target) else {
            return "Os dois assuntos precisam existir no mapa. Consulte as etapas e adicione-as pela interface antes de conectar.".into();
        };
        let mut edges = map.edges;
        edges.push(KnowledgeEdge {
            id: Uuid::new_v4().to_string(),
            source: source.id.clone(),
            target: target.id.clone(),
            relation: args.relation,
            description: args.explanation.unwrap_or_default(),
        });
        let revision = match knowledge::save_map_db(
            &mut conn,
            SaveMapPayload {
                map_id: args.map_id,
                expected_revision: map.map.revision,
                nodes: map.nodes,
                edges,
                viewport: map.viewport,
            },
        ) {
            Ok(r) => r,
            Err(e) => return e,
        };
        log_mcp_change(
            &conn,
            "connect_knowledge",
            &format!(
                "Relação {} -> {} criada",
                args.source_title, args.target_title
            ),
        );
        format!("Conexão salva (revisão {revision}).")
    }
    #[tool(
        description = "Crie uma nota de estudo; opcionalmente associe-a a um assunto existente de um mapa."
    )]
    fn add_study_note(&self, Parameters(args): Parameters<NoteArgs>) -> String {
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let note_target = match (args.target_kind.as_deref(), args.target_id.as_deref()) {
            (Some(kind), Some(id)) => {
                let table = match kind {
                    "roadmap_step" => "roadmap_steps",
                    "knowledge_node" => "knowledge_nodes",
                    "knowledge_edge" => "knowledge_edges",
                    _ => return "Tipo de destino inválido.".into(),
                };
                let exists: bool = conn
                    .query_row(
                        &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
                        [id],
                        |r| r.get(0),
                    )
                    .unwrap_or(false);
                if !exists {
                    return "Destino da nota não encontrado.".into();
                }
                Some((kind.to_owned(), id.to_owned()))
            }
            (None, None) => None,
            _ => return "Informe juntos o tipo e o ID do destino.".into(),
        };
        let id = Uuid::new_v4().to_string();
        if let Err(e) = conn.execute(
            "INSERT INTO notes(id,title,content,category,link) VALUES(?1,?2,?3,'Estudo','Agente')",
            params![id, args.title.trim(), args.content],
        ) {
            return format!("Falha ao criar nota: {e}");
        }
        if let (Some(map_id), Some(title)) = (args.map_id, args.node_title) {
            let node = conn.query_row(
                "SELECT id FROM knowledge_nodes WHERE map_id=?1 AND title=?2",
                params![map_id, title],
                |r| r.get::<_, String>(0),
            );
            if let Ok(node) = node {
                let _=conn.execute("INSERT OR IGNORE INTO knowledge_note_links(note_id,target_kind,target_id) VALUES(?1,'knowledge_node',?2)",params![id,node]);
            }
        }
        if let Some((kind, target)) = note_target {
            let _ = conn.execute("INSERT OR IGNORE INTO knowledge_note_links(note_id,target_kind,target_id) VALUES(?1,?2,?3)", params![id, kind, target]);
        }
        log_mcp_change(
            &conn,
            "add_study_note",
            &format!("Nota {} criada", args.title),
        );
        format!("Nota criada. ID: {id}")
    }
    #[tool(
        description = "Crie uma tarefa de estudo com duração opcional e vínculo opcional a uma etapa existente."
    )]
    fn create_study_task(&self, Parameters(args): Parameters<TaskArgs>) -> String {
        if args.title.trim().is_empty() || args.title.chars().count() > 200 {
            return "A tarefa precisa de um título de até 200 caracteres.".into();
        }
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        if let Some(step_id) = args.roadmap_step_id.as_deref() {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM roadmap_steps WHERE id=?1)",
                    [step_id],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            if !exists {
                return "Etapa para vínculo não encontrada.".into();
            }
        }
        let id = Uuid::new_v4().to_string();
        let subject = args.subject.unwrap_or_else(|| "Estudo".into());
        if let Err(e) = conn.execute("INSERT INTO tasks(id,title,group_name,subject,duration,priority,due) VALUES(?1,?2,'Próximas',?3,?4,'Média','Hoje')", params![id,args.title.trim(),subject,args.duration_minutes.unwrap_or(25).clamp(1,600)]) { return format!("Falha ao criar tarefa: {e}"); }
        if let Some(step_id) = args.roadmap_step_id {
            if let Err(e) = conn.execute(
                "INSERT INTO study_task_links(task_id,roadmap_step_id) VALUES(?1,?2)",
                params![id, step_id],
            ) {
                return format!("Tarefa criada, vínculo não salvo: {e}");
            }
        }
        log_mcp_change(
            &conn,
            "create_task",
            &format!("Tarefa {} criada", args.title),
        );
        format!("Tarefa criada. ID: {id}")
    }
    #[tool(
        description = "Leia os campos atuais de uma trilha, etapa, tarefa ou nota pelo ID e consulte a revisão antes de editar."
    )]
    fn read_study_item(&self, Parameters(args): Parameters<ReadItemArgs>) -> String {
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let revision = conn.query_row(
            "SELECT revision FROM entity_revisions WHERE entity_type=?1 AND entity_id=?2",
            params![args.entity_type, args.entity_id],
            |r| r.get::<_, i64>(0),
        );
        let Ok(revision) = revision else {
            return "Conteúdo não encontrado.".into();
        };
        let result=match args.entity_type.as_str(){
            "roadmap"=>conn.query_row("SELECT id,name,description,next_step FROM roadmaps WHERE id=?1",[&args.entity_id],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"description":r.get::<_,String>(2)?,"next_step":r.get::<_,Option<String>>(3)?}))),
            "roadmap_step"=>conn.query_row("SELECT rs.id,rs.title,rs.description,rs.status,rs.mastery,r.name,r.id FROM roadmap_steps rs JOIN roadmaps r ON r.id=rs.roadmap_id WHERE rs.id=?1",[&args.entity_id],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"description":r.get::<_,String>(2)?,"status":r.get::<_,String>(3)?,"mastery":r.get::<_,i64>(4)?,"roadmap":r.get::<_,String>(5)?,"roadmap_id":r.get::<_,String>(6)?}))),
            "task"=>conn.query_row("SELECT id,title,subject,duration,done,due FROM tasks WHERE id=?1",[&args.entity_id],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"subject":r.get::<_,String>(2)?,"duration_minutes":r.get::<_,i64>(3)?,"done":r.get::<_,bool>(4)?,"due":r.get::<_,String>(5)?}))),
            "note"=>conn.query_row("SELECT id,title,content,category,link FROM notes WHERE id=?1",[&args.entity_id],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"content":r.get::<_,String>(2)?,"category":r.get::<_,String>(3)?,"link":r.get::<_,String>(4)?}))),
            _=>return "Tipo não suportado. Use roadmap, roadmap_step, task ou note.".into(),
        };
        match result {
            Ok(item) => serde_json::json!({"revision":revision,"item":item}).to_string(),
            Err(_) => "Conteúdo não encontrado.".into(),
        }
    }
    #[tool(
        description = "Edite parcialmente uma trilha, etapa, tarefa ou nota. Envie expected_revision do read_study_item; conflitos não sobrescrevem alterações recentes. operation_id torna repetições seguras."
    )]
    fn update_study_item(&self, Parameters(args): Parameters<UpdateItemArgs>) -> String {
        let actor = MCP_CLIENT
            .try_with(Clone::clone)
            .unwrap_or_else(|_| "local-agent".into());
        let operation_key = args
            .operation_id
            .as_deref()
            .map(|id| format!("{actor}:{}", id.trim()));
        if operation_key.as_ref().is_some_and(|id| id.len() > 180) {
            return "O ID da operação excede 180 caracteres.".into();
        }
        let Ok(mut conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        if let Some(key) = operation_key.as_ref() {
            if let Ok(result) = conn.query_row(
                "SELECT result FROM agent_operations WHERE operation_id=?1",
                [key],
                |r| r.get::<_, String>(0),
            ) {
                return result;
            }
        }
        let tx = match conn.transaction() {
            Ok(tx) => tx,
            Err(e) => return e.to_string(),
        };
        let revision = tx.query_row(
            "SELECT revision FROM entity_revisions WHERE entity_type=?1 AND entity_id=?2",
            params![args.entity_type, args.entity_id],
            |r| r.get::<_, i64>(0),
        );
        let Ok(revision) = revision else {
            return "Conteúdo não encontrado.".into();
        };
        if revision != args.expected_revision {
            return format!(
                "Conflito: a revisão mudou de {} para {}. Leia novamente antes de editar.",
                args.expected_revision, revision
            );
        }
        let changed=match args.entity_type.as_str(){
            "roadmap"=>tx.execute("UPDATE roadmaps SET name=COALESCE(?1,name),description=COALESCE(?2,description),next_step=COALESCE(?3,next_step) WHERE id=?4",params![args.title.as_deref().map(str::trim),args.description,args.next_step,args.entity_id]),
            "roadmap_step"=>{if args.status.as_deref().is_some_and(|s|!["locked","available","active","in_progress","incomplete","done"].contains(&s)){return "Status de etapa inválido.".into();} tx.execute("UPDATE roadmap_steps SET title=COALESCE(?1,title),description=COALESCE(?2,description),status=COALESCE(?3,status),mastery=COALESCE(?4,mastery) WHERE id=?5",params![args.title.as_deref().map(str::trim),args.description,args.status,args.mastery.map(|v|v.clamp(0,100)),args.entity_id])},
            "task"=>tx.execute("UPDATE tasks SET title=COALESCE(?1,title),subject=COALESCE(?2,subject),duration=COALESCE(?3,duration),done=COALESCE(?4,done),updated_at=datetime('now') WHERE id=?5",params![args.title.as_deref().map(str::trim),args.subject,args.duration_minutes.map(|v|v.clamp(1,600)),args.done.map(i64::from),args.entity_id]),
            "note"=>tx.execute("UPDATE notes SET title=COALESCE(?1,title),content=COALESCE(?2,content),category=COALESCE(?3,category),updated_at=datetime('now') WHERE id=?4",params![args.title.as_deref().map(str::trim),args.content,args.category,args.entity_id]),
            _=>return "Tipo não suportado. Use roadmap, roadmap_step, task ou note.".into(),
        };
        if let Err(e) = changed {
            return format!("Falha ao editar: {e}");
        }
        let result = format!(
            "{} atualizado. Nova revisão: {}.",
            args.entity_type,
            args.expected_revision + 1
        );
        log_mcp_change(
            &tx,
            "update_study_item",
            &format!("{} {} atualizado", args.entity_type, args.entity_id),
        );
        if let Some(key) = operation_key {
            if let Err(e) = tx.execute(
                "INSERT INTO agent_operations(operation_id,client,result) VALUES(?1,?2,?3)",
                params![key, actor, result],
            ) {
                return format!("Falha ao guardar ID da operação: {e}");
            }
        }
        if let Err(e) = tx.commit() {
            return format!("Falha ao salvar edição: {e}");
        }
        result
    }
    #[tool(
        description = "Solicite a exclusão de uma trilha, tarefa, nota ou mapa. A exclusão fica pendente até aprovação no Study/OS."
    )]
    fn request_deletion(&self, Parameters(args): Parameters<DeleteArgs>) -> String {
        let allowed = ["roadmap", "task", "note", "knowledge_map"];
        if !allowed.contains(&args.entity_type.as_str()) {
            return "Tipo de entidade não permitido.".into();
        }
        let Ok(conn) = self.state.0.conn.lock() else {
            return "Erro ao acessar o banco.".into();
        };
        let id = Uuid::new_v4().to_string();
        let client = MCP_CLIENT
            .try_with(Clone::clone)
            .unwrap_or_else(|_| "local-agent".into());
        match conn.execute("INSERT INTO pending_deletions(id,client,entity_type,entity_id,summary,payload_json) VALUES(?1,?2,?3,?4,?5,'{}')",params![id,client,args.entity_type,args.entity_id,args.summary]) { Ok(_) => { log_mcp_change(&conn, "request_deletion", &args.summary); format!("Deletion awaiting approval in Study/OS. Request: {id}") }, Err(e) => format!("Failed: {e}") }
    }
}
impl ServerHandler for StudyTools {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_instructions("Study/OS: organize guias de estudo, tarefas, notas e mapas de conhecimento. Pesquise antes de criar. Relações devem ter justificativa útil.")
    }
}

async fn authorize(
    HttpState(db): HttpState<Database>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let Some(value) = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let digest = format!("{:x}", Sha256::digest(token.as_bytes()));
    let client: Option<String> = {
        let conn = db
            .conn
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let enabled = conn
            .query_row(
                "SELECT value FROM preferences WHERE key='agent_mcp_enabled'",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "false".into());
        if enabled != "true" && enabled != "\"true\"" {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        conn.query_row(
            "SELECT client FROM agent_tokens WHERE token_hash=?1",
            [digest],
            |r| r.get(0),
        )
        .ok()
    };
    let Some(client) = client else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    Ok(MCP_CLIENT.scope(client, next.run(request)).await)
}
pub fn start(_app: AppHandle, db: Database) {
    let enabled = db
        .conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT value FROM preferences WHERE key='agent_mcp_enabled'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .unwrap_or_else(|| "\"false\"".into());
    if enabled == "false" || enabled == "\"false\"" {
        return;
    }
    let port = db
        .conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT value FROM preferences WHERE key='agent_mcp_port'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|s| serde_json::from_str::<u16>(&s).ok())
        .unwrap_or(48731);
    let state = db.clone();
    let runtime = _app.state::<McpRuntime>();
    let token = CancellationToken::new();
    if let Ok(mut slot) = runtime.cancellation.lock() {
        if let Some(old) = slot.replace(token.clone()) {
            old.cancel();
        }
    }
    tauri::async_runtime::spawn(async move {
        let service: StreamableHttpService<StudyTools, LocalSessionManager> =
            StreamableHttpService::new(
                move || Ok(StudyTools::new(McpState(state.clone()))),
                Default::default(),
                StreamableHttpServerConfig::default()
                    .with_allowed_origins([
                        "tauri://localhost",
                        "http://localhost:1420",
                        "http://tauri.localhost",
                    ])
                    .enforce_origin_validation()
                    .with_sse_keep_alive(None),
            );
        let router = axum::Router::<Database>::new()
            .nest_service("/mcp", service)
            .layer(middleware::from_fn_with_state(db.clone(), authorize))
            .with_state(db.clone());
        if let Ok(listener) = tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(token.cancelled_owned())
                .await;
        }
    });
}

#[derive(Default)]
pub struct McpRuntime {
    cancellation: std::sync::Mutex<Option<CancellationToken>>,
}
fn restart(app: &AppHandle, db: &Database) {
    if let Some(runtime) = app.try_state::<McpRuntime>() {
        if let Ok(mut slot) = runtime.cancellation.lock() {
            if let Some(old) = slot.take() {
                old.cancel();
            }
        }
    }
    start(app.clone(), db.clone());
}

#[derive(Serialize)]
pub struct AgentSettings {
    pub enabled: bool,
    pub port: u16,
    pub endpoint: String,
}
#[tauri::command]
pub fn get_agent_settings(db: State<'_, Database>) -> AgentSettings {
    let c = db.conn.lock().ok();
    let enabled = c
        .as_ref()
        .and_then(|c| {
            c.query_row(
                "SELECT value FROM preferences WHERE key='agent_mcp_enabled'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .map(|v| v == "true" || v == "\"true\"")
        .unwrap_or(false);
    let port = c
        .and_then(|c| {
            c.query_row(
                "SELECT value FROM preferences WHERE key='agent_mcp_port'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|v| serde_json::from_str::<u16>(&v).ok())
        .unwrap_or(48731);
    AgentSettings {
        enabled,
        port,
        endpoint: format!("http://127.0.0.1:{port}/mcp"),
    }
}
#[tauri::command]
pub fn set_agent_enabled(
    app: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    if enabled {
        let port = c
            .query_row(
                "SELECT value FROM preferences WHERE key='agent_mcp_port'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| serde_json::from_str::<u16>(&v).ok())
            .unwrap_or(48731);
        let probe = std::net::TcpListener::bind(("127.0.0.1", port)).map_err(|_| {
            format!("A porta {port} já está ocupada. Altere a porta antes de ativar o MCP.")
        })?;
        drop(probe);
    }
    let v = serde_json::to_string(&enabled).map_err(|e| e.to_string())?;
    c.execute("INSERT INTO preferences(key,value) VALUES('agent_mcp_enabled',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[v]).map_err(|e|e.to_string())?;
    if !enabled {
        c.execute("DELETE FROM agent_tokens", [])
            .map_err(|e| e.to_string())?;
        drop(c);
        if let Some(runtime) = app.try_state::<McpRuntime>() {
            if let Ok(mut slot) = runtime.cancellation.lock() {
                if let Some(old) = slot.take() {
                    old.cancel();
                }
            }
        }
    } else {
        drop(c);
        restart(&app, &db);
    }
    Ok(())
}
#[tauri::command]
pub fn set_agent_port(app: AppHandle, db: State<'_, Database>, port: u16) -> Result<(), String> {
    if !(1024..=65535).contains(&port) {
        return Err("Escolha uma porta entre 1024 e 65535.".into());
    }
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    let current = c
        .query_row(
            "SELECT value FROM preferences WHERE key='agent_mcp_port'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| serde_json::from_str::<u16>(&v).ok())
        .unwrap_or(48731);
    let enabled = c
        .query_row(
            "SELECT value FROM preferences WHERE key='agent_mcp_enabled'",
            [],
            |r| r.get::<_, String>(0),
        )
        .map(|v| v == "true" || v == "\"true\"")
        .unwrap_or(false);
    if enabled && port != current {
        let probe = std::net::TcpListener::bind(("127.0.0.1", port))
            .map_err(|_| format!("A porta {port} já está ocupada. Escolha outra porta."))?;
        drop(probe);
    }
    let v = serde_json::to_string(&port).map_err(|e| e.to_string())?;
    c.execute("INSERT INTO preferences(key,value) VALUES('agent_mcp_port',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[v]).map_err(|e|e.to_string())?;
    drop(c);
    restart(&app, &db);
    Ok(())
}
#[tauri::command]
pub fn generate_agent_token(db: State<'_, Database>, client: String) -> Result<String, String> {
    if !["codex", "claude", "antigravity"].contains(&client.as_str()) {
        return Err("Cliente inválido.".into());
    }
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    let digest = format!("{:x}", Sha256::digest(token.as_bytes()));
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    c.execute("INSERT INTO agent_tokens(client,token_hash,created_at) VALUES(?1,?2,datetime('now')) ON CONFLICT(client) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at",params![client,digest]).map_err(|e|e.to_string())?;
    Ok(token)
}
#[tauri::command]
pub fn revoke_agent_token(db: State<'_, Database>, client: String) -> Result<(), String> {
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .execute("DELETE FROM agent_tokens WHERE client=?1", [client])
        .map(|_| ())
        .map_err(|e| e.to_string())
}
#[derive(Serialize)]
pub struct AgentTokenInfo {
    client: String,
    created_at: String,
}
#[tauri::command]
pub fn list_agent_tokens(db: State<'_, Database>) -> Result<Vec<AgentTokenInfo>, String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    let mut s = c
        .prepare("SELECT client,created_at FROM agent_tokens ORDER BY client")
        .map_err(|e| e.to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok(AgentTokenInfo {
                client: r.get(0)?,
                created_at: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
#[derive(Serialize)]
pub struct AgentHistory {
    client: String,
    operation: String,
    summary: String,
    created_at: String,
}
#[tauri::command]
pub fn get_agent_history(db: State<'_, Database>) -> Result<Vec<AgentHistory>, String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    let mut s=c.prepare("SELECT client,operation,summary,created_at FROM agent_change_log ORDER BY created_at DESC LIMIT 100").map_err(|e|e.to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok(AgentHistory {
                client: r.get(0)?,
                operation: r.get(1)?,
                summary: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
#[derive(Serialize)]
pub struct PendingDeletion {
    pub id: String,
    pub client: String,
    pub entity_type: String,
    pub entity_id: String,
    pub summary: String,
    pub created_at: String,
}
#[tauri::command]
pub fn get_pending_deletions(db: State<'_, Database>) -> Result<Vec<PendingDeletion>, String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    let mut s=c.prepare("SELECT id,client,entity_type,entity_id,summary,created_at FROM pending_deletions ORDER BY created_at DESC").map_err(|e|e.to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok(PendingDeletion {
                id: r.get(0)?,
                client: r.get(1)?,
                entity_type: r.get(2)?,
                entity_id: r.get(3)?,
                summary: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn resolve_pending_deletion(
    db: State<'_, Database>,
    id: String,
    approve: bool,
) -> Result<(), String> {
    let mut c = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let item = tx
        .query_row(
            "SELECT entity_type,entity_id,summary,client FROM pending_deletions WHERE id=?1",
            [&id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    if approve {
        let table = match item.0.as_str() {
            "roadmap" => "roadmaps",
            "task" => "tasks",
            "note" => "notes",
            "knowledge_map" => "knowledge_maps",
            _ => return Err("Tipo inválido.".into()),
        };
        tx.execute(&format!("DELETE FROM {table} WHERE id=?1"), [item.1])
            .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "INSERT INTO agent_change_log(id,client,operation,summary) VALUES(?1,?2,?3,?4)",
        params![
            Uuid::new_v4().to_string(),
            item.3,
            if approve {
                "delete_approved"
            } else {
                "delete_rejected"
            },
            item.2
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM pending_deletions WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}
