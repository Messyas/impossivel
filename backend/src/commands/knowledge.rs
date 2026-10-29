use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeMap {
    pub id: String,
    pub name: String,
    pub description: String,
    pub revision: i64,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeNode {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub description: String,
    pub roadmap_step_id: Option<String>,
    pub source_roadmap_name: Option<String>,
    pub x: f64,
    pub y: f64,
    pub status: Option<String>,
    pub mastery: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub relation: String,
    pub description: String,
}
#[derive(Debug, Serialize)]
pub struct KnowledgeMapData {
    pub map: KnowledgeMap,
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<KnowledgeEdge>,
    pub viewport: serde_json::Value,
}
#[derive(Debug, Deserialize)]
pub struct SaveMapPayload {
    pub map_id: String,
    pub expected_revision: i64,
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<KnowledgeEdge>,
    pub viewport: serde_json::Value,
}
#[derive(Debug, Deserialize)]
pub struct SearchStepsPayload {
    pub search: Option<String>,
    pub roadmap_id: Option<String>,
    pub offset: Option<i64>,
}
#[derive(Debug, Serialize)]
pub struct KnowledgeRoadmapRef {
    pub id: String,
    pub name: String,
}
#[tauri::command]
pub fn list_knowledge_roadmaps(
    db: State<'_, Database>,
) -> Result<Vec<KnowledgeRoadmapRef>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,name FROM roadmaps ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(KnowledgeRoadmapRef {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn list_maps_db(conn: &rusqlite::Connection) -> Result<Vec<KnowledgeMap>, String> {
    let mut stmt = conn.prepare("SELECT id,name,description,revision,updated_at FROM knowledge_maps ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(KnowledgeMap {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                revision: r.get(3)?,
                updated_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO knowledge_maps(id,name) VALUES('map-test','Teste')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn map_save_persists_nodes_and_rejects_stale_revisions() {
        let mut conn = connection();
        let node = KnowledgeNode {
            id: "node-test".into(),
            kind: "concept".into(),
            title: "Ownership".into(),
            description: "Regras de posse".into(),
            roadmap_step_id: None,
            source_roadmap_name: None,
            x: 120.0,
            y: 80.0,
            status: None,
            mastery: None,
        };
        let payload = SaveMapPayload {
            map_id: "map-test".into(),
            expected_revision: 1,
            nodes: vec![node],
            edges: vec![],
            viewport: serde_json::json!({"x":10,"y":20,"zoom":1.25}),
        };
        assert_eq!(save_map_db(&mut conn, payload).unwrap(), 2);
        assert_eq!(
            get_map_db(&conn, "map-test").unwrap().nodes[0].title,
            "Ownership"
        );
        let stale = SaveMapPayload {
            map_id: "map-test".into(),
            expected_revision: 1,
            nodes: vec![],
            edges: vec![],
            viewport: serde_json::json!({}),
        };
        assert!(save_map_db(&mut conn, stale)
            .unwrap_err()
            .contains("Conflito"));
    }

    #[test]
    fn map_rejects_self_edges() {
        let mut conn = connection();
        let node = KnowledgeNode {
            id: "node-test".into(),
            kind: "concept".into(),
            title: "Ownership".into(),
            description: String::new(),
            roadmap_step_id: None,
            source_roadmap_name: None,
            x: 0.0,
            y: 0.0,
            status: None,
            mastery: None,
        };
        let edge = KnowledgeEdge {
            id: "edge-test".into(),
            source: "node-test".into(),
            target: "node-test".into(),
            relation: "requires".into(),
            description: String::new(),
        };
        let payload = SaveMapPayload {
            map_id: "map-test".into(),
            expected_revision: 1,
            nodes: vec![node],
            edges: vec![edge],
            viewport: serde_json::json!({}),
        };
        assert!(save_map_db(&mut conn, payload)
            .unwrap_err()
            .contains("assuntos diferentes"));
    }
}
#[tauri::command]
pub fn list_maps(db: State<'_, Database>) -> Result<Vec<KnowledgeMap>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    list_maps_db(&conn)
}

#[tauri::command]
pub fn create_knowledge_map(
    db: State<'_, Database>,
    name: String,
    description: Option<String>,
) -> Result<KnowledgeMap, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("Nome do mapa precisa ter de 1 a 100 caracteres.".into());
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO knowledge_maps(id,name,description) VALUES(?1,?2,?3)",
        params![id, name, description.unwrap_or_default()],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id,name,description,revision,updated_at FROM knowledge_maps WHERE id=?1",
        [id],
        |r| {
            Ok(KnowledgeMap {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                revision: r.get(3)?,
                updated_at: r.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn rename_knowledge_map(
    db: State<'_, Database>,
    id: String,
    name: String,
    description: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("Nome inválido.".into());
    }
    conn.execute("UPDATE knowledge_maps SET name=?1,description=COALESCE(?2,description),revision=revision+1,updated_at=datetime('now') WHERE id=?3",params![name,description,id]).map_err(|e|e.to_string()).and_then(|n|if n==0{Err("Mapa não encontrado.".into())}else{Ok(())})
}
#[tauri::command]
pub fn delete_knowledge_map(db: State<'_, Database>, id: String) -> Result<(), String> {
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .execute("DELETE FROM knowledge_maps WHERE id=?1", [id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}
pub fn get_map_db(conn: &rusqlite::Connection, id: &str) -> Result<KnowledgeMapData, String> {
    let map = conn
        .query_row(
            "SELECT id,name,description,revision,updated_at FROM knowledge_maps WHERE id=?1",
            [id],
            |r| {
                Ok(KnowledgeMap {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    revision: r.get(3)?,
                    updated_at: r.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let viewport_raw: String = conn
        .query_row(
            "SELECT viewport_json FROM knowledge_maps WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt=conn.prepare("SELECT n.id,n.kind,COALESCE(rs.title,n.title),CASE WHEN n.kind='roadmap_step' AND n.roadmap_step_id IS NOT NULL THEN COALESCE(rs.description,n.description) ELSE n.description END,n.roadmap_step_id,COALESCE(r.name,n.source_roadmap_name),n.position_x,n.position_y,rs.status,rs.mastery FROM knowledge_nodes n LEFT JOIN roadmap_steps rs ON rs.id=n.roadmap_step_id LEFT JOIN roadmaps r ON r.id=rs.roadmap_id WHERE n.map_id=?1 ORDER BY n.created_at").map_err(|e|e.to_string())?;
    let nodes = stmt
        .query_map([id], |r| {
            Ok(KnowledgeNode {
                id: r.get(0)?,
                kind: r.get(1)?,
                title: r.get(2)?,
                description: r.get(3)?,
                roadmap_step_id: r.get(4)?,
                source_roadmap_name: r.get(5)?,
                x: r.get(6)?,
                y: r.get(7)?,
                status: r.get(8)?,
                mastery: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut stmt=conn.prepare("SELECT id,source_id,target_id,relation,description FROM knowledge_edges WHERE map_id=?1 ORDER BY created_at").map_err(|e|e.to_string())?;
    let edges = stmt
        .query_map([id], |r| {
            Ok(KnowledgeEdge {
                id: r.get(0)?,
                source: r.get(1)?,
                target: r.get(2)?,
                relation: r.get(3)?,
                description: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(KnowledgeMapData {
        map,
        nodes,
        edges,
        viewport: serde_json::from_str(&viewport_raw)
            .unwrap_or_else(|_| serde_json::json!({"x":0,"y":0,"zoom":1})),
    })
}
#[tauri::command]
pub fn get_knowledge_map(db: State<'_, Database>, id: String) -> Result<KnowledgeMapData, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    get_map_db(&conn, &id)
}
pub fn save_map_db(conn: &mut rusqlite::Connection, p: SaveMapPayload) -> Result<i64, String> {
    if p.nodes.len() > 500 || p.edges.len() > 2000 {
        return Err("O mapa excede o limite de elementos.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let revision: Option<i64> = tx
        .query_row(
            "SELECT revision FROM knowledge_maps WHERE id=?1",
            [&p.map_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(revision) = revision else {
        return Err("Mapa não encontrado.".into());
    };
    if revision != p.expected_revision {
        return Err(format!(
            "Conflito: mapa mudou de revisão {} para {}. Recarregue antes de salvar.",
            p.expected_revision, revision
        ));
    }
    let node_ids = p
        .nodes
        .iter()
        .map(|n| n.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    if node_ids.len() != p.nodes.len() {
        return Err("IDs de nós duplicados.".into());
    }
    let edge_ids = p
        .edges
        .iter()
        .map(|e| e.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    if edge_ids.len() != p.edges.len() {
        return Err("IDs de relações duplicados.".into());
    }
    for e in &p.edges {
        if e.source == e.target {
            return Err("Uma conexão precisa ligar assuntos diferentes.".into());
        }
        if !node_ids.contains(e.source.as_str()) || !node_ids.contains(e.target.as_str()) {
            return Err("A conexão aponta para um assunto que não está no mapa.".into());
        }
        if e.relation.trim().is_empty() || e.relation.chars().count() > 100 {
            return Err("Dê um nome de até 100 caracteres à conexão.".into());
        }
    }
    let mut seen = std::collections::HashSet::new();
    for n in &p.nodes {
        if n.title.trim().is_empty() || n.title.chars().count() > 200 || n.description.len() > 10000
        {
            return Err("Título ou descrição do assunto inválidos.".into());
        }
        if let Some(sid) = &n.roadmap_step_id {
            if !seen.insert(sid) {
                return Err("Uma etapa aparece mais de uma vez neste mapa.".into());
            }
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM roadmap_steps WHERE id=?1)",
                    [sid],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !exists {
                return Err("Uma etapa vinculada foi removida. Atualize o mapa.".into());
            }
        }
    }
    let existing_node_ids = {
        let mut stmt = tx
            .prepare("SELECT id FROM knowledge_nodes WHERE map_id=?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&p.map_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<std::collections::HashSet<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    let existing_edge_ids = {
        let mut stmt = tx
            .prepare("SELECT id FROM knowledge_edges WHERE map_id=?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&p.map_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<std::collections::HashSet<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    for id in existing_node_ids.difference(&node_ids.iter().map(|id| id.to_string()).collect()) {
        tx.execute(
            "DELETE FROM knowledge_note_links WHERE target_kind='knowledge_node' AND target_id=?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
    }
    for id in existing_edge_ids.difference(&edge_ids.iter().map(|id| id.to_string()).collect()) {
        tx.execute(
            "DELETE FROM knowledge_note_links WHERE target_kind='knowledge_edge' AND target_id=?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute("DELETE FROM knowledge_edges WHERE map_id=?1", [&p.map_id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM knowledge_nodes WHERE map_id=?1", [&p.map_id])
        .map_err(|e| e.to_string())?;
    for n in &p.nodes {
        let kind = if n.roadmap_step_id.is_some() {
            "roadmap_step"
        } else {
            "concept"
        };
        tx.execute("INSERT INTO knowledge_nodes(id,map_id,kind,title,description,roadmap_step_id,source_roadmap_name,position_x,position_y) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![n.id,p.map_id,kind,n.title.trim(),n.description,n.roadmap_step_id,n.source_roadmap_name,n.x,n.y]).map_err(|e|e.to_string())?;
    }
    for e in &p.edges {
        tx.execute("INSERT INTO knowledge_edges(id,map_id,source_id,target_id,relation,description) VALUES(?1,?2,?3,?4,?5,?6)",params![e.id,p.map_id,e.source,e.target,e.relation.trim(),e.description]).map_err(|e|e.to_string())?;
    }
    let viewport = serde_json::to_string(&p.viewport).map_err(|e| e.to_string())?;
    let next = revision + 1;
    tx.execute("UPDATE knowledge_maps SET viewport_json=?1,revision=?2,updated_at=datetime('now') WHERE id=?3",params![viewport,next,p.map_id]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(next)
}
#[tauri::command]
pub fn save_knowledge_map(db: State<'_, Database>, payload: SaveMapPayload) -> Result<i64, String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    save_map_db(&mut conn, payload)
}
#[tauri::command]
pub fn search_knowledge_steps(
    db: State<'_, Database>,
    query: Option<SearchStepsPayload>,
) -> Result<Vec<KnowledgeNode>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let q = query.unwrap_or(SearchStepsPayload {
        search: None,
        roadmap_id: None,
        offset: None,
    });
    let term = q.search.unwrap_or_default();
    let term = term.trim().chars().take(120).collect::<String>();
    let pattern = format!("%{}%", term.replace('%', "\\%").replace('_', "\\_"));
    let mut stmt=conn.prepare("SELECT rs.id,'roadmap_step',rs.title,rs.description,rs.id,r.name,0,0,rs.status,rs.mastery FROM roadmap_steps rs JOIN roadmaps r ON r.id=rs.roadmap_id WHERE (?1='' OR rs.title LIKE ?2 ESCAPE '\\' OR rs.description LIKE ?2 ESCAPE '\\' OR r.name LIKE ?2 ESCAPE '\\') AND (?3 IS NULL OR r.id=?3) ORDER BY r.name,rs.sort_order LIMIT 50 OFFSET ?4").map_err(|e|e.to_string())?;
    let rows = stmt
        .query_map(
            params![term, pattern, q.roadmap_id, q.offset.unwrap_or(0).max(0)],
            |r| {
                Ok(KnowledgeNode {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    title: r.get(2)?,
                    description: r.get(3)?,
                    roadmap_step_id: r.get(4)?,
                    source_roadmap_name: r.get(5)?,
                    x: r.get(6)?,
                    y: r.get(7)?,
                    status: r.get(8)?,
                    mastery: r.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
