// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { __profile_internal, getRelationshipProfileSkillInfo } from "../../relationship-profile/runtime/relationship-profile.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const runsDir = path.join(__dirname, "runs");
const storesDir = path.join(__dirname, "stores");
const { default_store_path: defaultStorePath } = getRelationshipProfileSkillInfo();
const defaultReviewStorePath = path.join(storesDir, "relationship-graph-review-store.json");

const SKILL_NAME = "relationship-graph";
const SKILL_VERSION = "0.1.0";
const DEFAULT_OPTIONS = {
  save_run_artifacts: true,
  max_nodes: 20,
  max_edges: 40,
  max_path_length: 4,
  min_relation_score: 2
};

export function getRelationshipGraphSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    runs_dir: runsDir,
    default_store_path: defaultStorePath,
    default_review_store_path: defaultReviewStorePath
  };
}

export function runRelationshipGraph(payload) {
  const request = validateGraphRequest(payload);
  const store = loadProfileStore(request.profile_store_path || defaultStorePath);
  const reviewStore = loadGraphReviewStore(request.graph_review_store_path || defaultReviewStorePath);
  const graphData = buildGraphData(store.profiles, request.options, reviewStore);

  let result;
  if (request.mode === "get_person_graph") {
    result = handleGetPersonGraph({ request, store, graphData });
  } else if (request.mode === "find_connection_path") {
    result = handleFindConnectionPath({ request, store, graphData });
  } else {
    result = handleSummarizeNetwork({ graphData, store });
  }

  const response = {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    run_directory: null,
    ...result
  };

  if (request.options.save_run_artifacts) {
    response.run_directory = persistRunArtifacts({ request, response });
  }

  return response;
}

function validateGraphRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("relationship-graph request 必须是对象");
  }

  const options = {
    ...DEFAULT_OPTIONS,
    ...(payload.options && typeof payload.options === "object" ? payload.options : {})
  };

  return {
    skill: normalizeString(payload.skill) || SKILL_NAME,
    version: normalizeString(payload.version) || SKILL_VERSION,
    mode: normalizeString(payload.mode) || deriveMode(payload),
    profile_store_path: normalizeString(payload.profile_store_path) || defaultStorePath,
    graph_review_store_path: normalizeString(payload.graph_review_store_path) || defaultReviewStorePath,
    person_name: normalizeString(payload.person_name),
    person_ref: normalizeString(payload.person_ref),
    target_person_name: normalizeString(payload.target_person_name),
    target_person_ref: normalizeString(payload.target_person_ref),
    options: {
      save_run_artifacts: options.save_run_artifacts !== false,
      max_nodes: clampInteger(options.max_nodes, DEFAULT_OPTIONS.max_nodes, 3, 100),
      max_edges: clampInteger(options.max_edges, DEFAULT_OPTIONS.max_edges, 3, 200),
      max_path_length: clampInteger(options.max_path_length, DEFAULT_OPTIONS.max_path_length, 1, 8),
      min_relation_score: clampInteger(options.min_relation_score, DEFAULT_OPTIONS.min_relation_score, 1, 100)
    }
  };
}

function deriveMode(payload) {
  if (payload.target_person_name || payload.target_person_ref) {
    return "find_connection_path";
  }
  if (payload.person_name || payload.person_ref) {
    return "get_person_graph";
  }
  return "summarize_network";
}

function loadProfileStore(storePath) {
  if (!storePath || !existsSync(storePath)) {
    return {
      version: SKILL_VERSION,
      updated_at: "",
      profiles: []
    };
  }

  const parsed = JSON.parse(readFileSync(storePath, "utf8").replace(/^\uFEFF/, ""));
  return {
    version: normalizeString(parsed.version) || SKILL_VERSION,
    updated_at: normalizeString(parsed.updated_at),
    profiles: Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => __profile_internal.normalizeRelationshipProfile(profile))
      : []
  };
}

function loadGraphReviewStore(storePath) {
  if (!storePath || !existsSync(storePath)) {
    return {
      version: SKILL_VERSION,
      updated_at: "",
      decisions: []
    };
  }

  const parsed = JSON.parse(readFileSync(storePath, "utf8").replace(/^\uFEFF/, ""));
  return {
    version: normalizeString(parsed.version) || SKILL_VERSION,
    updated_at: normalizeString(parsed.updated_at),
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.map((decision) => normalizeGraphReviewDecision(decision))
      : []
  };
}

function buildGraphData(profiles, options, reviewStore) {
  const normalizedProfiles = profiles.map((profile) => __profile_internal.normalizeRelationshipProfile(profile));
  const nodeMap = new Map(normalizedProfiles.map((profile) => [profile.person_ref, profile]));
  const edgeMap = new Map();

  normalizedProfiles.forEach((profile) => {
    const related = __profile_internal.buildRelatedPeople(profile, normalizedProfiles, normalizedProfiles.length);
    related
      .filter((item) => item.relation_score >= options.min_relation_score)
      .forEach((item) => {
        const source = profile.person_ref;
        const target = item.person_ref;
        const key = [source, target].sort().join("::");
        const edge = {
          source: [source, target].sort()[0],
          target: [source, target].sort()[1],
          relation_score: item.relation_score,
          relation_type: item.relation_type,
          relation_reasons: Array.isArray(item.relation_reasons) ? item.relation_reasons : [],
          shared_sources: Array.isArray(item.shared_sources) ? item.shared_sources : [],
          shared_tags: Array.isArray(item.shared_tags) ? item.shared_tags : []
        };
        const existing = edgeMap.get(key);
        if (!existing || edge.relation_score > existing.relation_score) {
          edgeMap.set(key, {
            ...edge,
            relation_reasons: uniqueStrings([...(existing?.relation_reasons || []), ...edge.relation_reasons]),
            shared_sources: uniqueStrings([...(existing?.shared_sources || []), ...edge.shared_sources]),
            shared_tags: uniqueStrings([...(existing?.shared_tags || []), ...edge.shared_tags])
          });
        }
      });
  });

  const rawEdges = Array.from(edgeMap.values()).sort((left, right) => right.relation_score - left.relation_score);
  const edges = applyReviewDecisionsToEdges(rawEdges, reviewStore);
  const adjacency = buildAdjacency(edges);

  return {
    profiles: normalizedProfiles,
    nodeMap,
    edges,
    adjacency,
    review_store: reviewStore
  };
}

function applyReviewDecisionsToEdges(edges, reviewStore) {
  const decisionsByKey = new Map((reviewStore?.decisions || []).map((decision) => [decision.edge_key, decision]));
  return edges
    .map((edge) => {
      const decision = decisionsByKey.get(edgeKey(edge.source, edge.target));
      if (!decision) {
        return {
          ...edge,
          review_status: "unreviewed"
        };
      }

      if (decision.final_action === "reject") {
        return null;
      }

      return {
        ...edge,
        relation_type: decision.corrected_relation_type || edge.relation_type,
        review_status: decision.final_action,
        review_note: decision.note,
        reviewed_at: decision.reviewed_at,
        reviewed_by: decision.operator
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.relation_score - left.relation_score);
}

function buildAdjacency(edges) {
  const adjacency = new Map();
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push({ neighbor: edge.target, edge });
    adjacency.get(edge.target).push({ neighbor: edge.source, edge });
  });
  return adjacency;
}

function handleGetPersonGraph({ request, store, graphData }) {
  const root = resolvePerson({ graphData, personName: request.person_name, personRef: request.person_ref });
  if (!root) {
    return emptyResponse({
      mode: request.mode,
      note: "未找到目标人物，建议先确认 person_name / person_ref 是否正确。"
    });
  }

  const neighbors = (graphData.adjacency.get(root.person_ref) || [])
    .sort((left, right) => right.edge.relation_score - left.edge.relation_score);

  const relatedPeople = neighbors.slice(0, request.options.max_nodes - 1).map(({ neighbor, edge }) => {
    const profile = graphData.nodeMap.get(neighbor);
    return {
      person_name: profile.person_name,
      person_ref: profile.person_ref,
      relation_type: edge.relation_type,
      relation_score: edge.relation_score,
      relation_reasons: edge.relation_reasons
    };
  });

  const nodeRefs = new Set([root.person_ref, ...relatedPeople.map((item) => item.person_ref)]);
  const graph = buildSubgraph({
    graphData,
    nodeRefs,
    rootRef: root.person_ref,
    targetRef: null,
    maxEdges: request.options.max_edges
  });
  const reviewBundle = buildGraphReviewBundle({
    graph,
    graphData,
    mode: request.mode
  });
  const renderArtifacts = buildRenderArtifacts({
    mode: request.mode,
    graph,
    rootPerson: buildPersonCard(root),
    targetPerson: null,
    reviewBundle
  });

  return {
    status: "success",
    mode: request.mode,
    root_person: buildPersonCard(root),
    target_person: null,
    related_people: relatedPeople,
    connection_path: [],
    graph,
    network_summary: buildNetworkSummary({
      graphData,
      graph,
      store,
      mode: request.mode
    }),
    influence_notes: buildInfluenceNotesForRoot(root, relatedPeople, graphData),
    review_bundle: reviewBundle,
    render_artifacts: renderArtifacts,
    user_feedback: buildUserFeedbackForPersonGraph({
      root,
      relatedPeople,
      graph,
      reviewBundle
    }),
    notes: ""
  };
}

function handleFindConnectionPath({ request, store, graphData }) {
  const root = resolvePerson({ graphData, personName: request.person_name, personRef: request.person_ref });
  const target = resolvePerson({ graphData, personName: request.target_person_name, personRef: request.target_person_ref });

  if (!root || !target) {
    return emptyResponse({
      mode: request.mode,
      note: "未找到起点或终点人物，建议先确认输入。"
    });
  }

  const pathRefs = findShortestPath(graphData.adjacency, root.person_ref, target.person_ref, request.options.max_path_length);
  if (!pathRefs.length) {
    return {
      ...emptyResponse({
        mode: request.mode,
        note: "当前 store 内没有找到可用连接路径。"
      }),
      root_person: buildPersonCard(root),
      target_person: buildPersonCard(target),
      graph: buildSubgraph({
        graphData,
        nodeRefs: new Set([root.person_ref, target.person_ref]),
        rootRef: root.person_ref,
        targetRef: target.person_ref,
        maxEdges: request.options.max_edges
      })
    };
  }

  const connectionPath = pathRefs.map((personRef) => buildPersonCard(graphData.nodeMap.get(personRef)));
  const graph = buildPathGraph({ graphData, pathRefs });
  const reviewBundle = buildGraphReviewBundle({
    graph,
    graphData,
    mode: request.mode
  });
  const rootCard = buildPersonCard(root);
  const targetCard = buildPersonCard(target);
  const renderArtifacts = buildRenderArtifacts({
    mode: request.mode,
    graph,
    rootPerson: rootCard,
    targetPerson: targetCard,
    reviewBundle
  });

  return {
    status: "success",
    mode: request.mode,
    root_person: rootCard,
    target_person: targetCard,
    related_people: [],
    connection_path: connectionPath,
    graph,
    network_summary: buildNetworkSummary({
      graphData,
      graph,
      store,
      mode: request.mode,
      pathRefs
    }),
    influence_notes: buildInfluenceNotesForPath(pathRefs, graphData),
    review_bundle: reviewBundle,
    render_artifacts: renderArtifacts,
    user_feedback: buildUserFeedbackForPath({
      root,
      target,
      pathRefs,
      graphData,
      reviewBundle
    }),
    notes: ""
  };
}

function handleSummarizeNetwork({ graphData, store }) {
  const topEdges = graphData.edges.slice(0, 20);
  const usedRefs = new Set(topEdges.flatMap((edge) => [edge.source, edge.target]));
  const graph = buildSubgraph({
    graphData,
    nodeRefs: usedRefs,
    rootRef: null,
    targetRef: null,
    maxEdges: 20
  });
  const reviewBundle = buildGraphReviewBundle({
    graph,
    graphData,
    mode: "summarize_network"
  });
  const renderArtifacts = buildRenderArtifacts({
    mode: "summarize_network",
    graph,
    rootPerson: null,
    targetPerson: null,
    reviewBundle
  });

  return {
    status: "success",
    mode: "summarize_network",
    root_person: null,
    target_person: null,
    related_people: [],
    connection_path: [],
    graph,
    network_summary: buildNetworkSummary({
      graphData,
      graph,
      store,
      mode: "summarize_network"
    }),
    influence_notes: buildGlobalInfluenceNotes(graphData),
    review_bundle: reviewBundle,
    render_artifacts: renderArtifacts,
    user_feedback: buildUserFeedbackForSummary(graphData, graph, store, reviewBundle),
    notes: ""
  };
}

function resolvePerson({ graphData, personName, personRef }) {
  if (personRef) {
    return graphData.nodeMap.get(personRef) || null;
  }
  const normalizedName = normalizeKey(personName);
  if (!normalizedName) {
    return null;
  }
  return graphData.profiles.find((profile) => {
    if (normalizeKey(profile.person_name) === normalizedName) {
      return true;
    }
    return Array.isArray(profile.aliases)
      ? profile.aliases.some((alias) => normalizeKey(alias) === normalizedName)
      : false;
  }) || null;
}

function findShortestPath(adjacency, sourceRef, targetRef, maxDepth) {
  if (sourceRef === targetRef) {
    return [sourceRef];
  }
  const queue = [[sourceRef]];
  const visited = new Set([sourceRef]);

  while (queue.length) {
    const currentPath = queue.shift();
    const current = currentPath[currentPath.length - 1];
    if (currentPath.length > maxDepth + 1) {
      continue;
    }
    for (const { neighbor } of adjacency.get(current) || []) {
      if (visited.has(neighbor)) {
        continue;
      }
      const nextPath = [...currentPath, neighbor];
      if (neighbor === targetRef) {
        return nextPath;
      }
      visited.add(neighbor);
      queue.push(nextPath);
    }
  }

  return [];
}

function buildSubgraph({ graphData, nodeRefs, rootRef, targetRef, maxEdges }) {
  const refs = Array.from(nodeRefs).filter(Boolean);
  const nodes = refs
    .map((personRef) => {
      const profile = graphData.nodeMap.get(personRef);
      if (!profile) {
        return null;
      }
      let kind = "profile";
      if (rootRef && personRef === rootRef) {
        kind = "root";
      } else if (targetRef && personRef === targetRef) {
        kind = "target";
      } else if (targetRef) {
        kind = "path";
      } else if (rootRef) {
        kind = "neighbor";
      }
      return {
        person_name: profile.person_name,
        person_ref: profile.person_ref,
        profile_tier: profile.profile_tier,
        confidence: profile.confidence,
        kind
      };
    })
    .filter(Boolean);

  const edges = graphData.edges
    .filter((edge) => nodeRefs.has(edge.source) && nodeRefs.has(edge.target))
    .slice(0, maxEdges)
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      relation_score: edge.relation_score,
      relation_type: edge.relation_type,
      relation_reasons: edge.relation_reasons,
      review_status: edge.review_status || "unreviewed",
      review_note: normalizeString(edge.review_note),
      shared_sources: edge.shared_sources,
      shared_tags: edge.shared_tags
    }));

  return { nodes, edges };
}

function buildPathGraph({ graphData, pathRefs }) {
  const nodeRefs = new Set(pathRefs);
  const pathEdges = [];
  for (let index = 0; index < pathRefs.length - 1; index += 1) {
    const left = pathRefs[index];
    const right = pathRefs[index + 1];
    const edge = graphData.edges.find((item) =>
      (item.source === left && item.target === right) ||
      (item.source === right && item.target === left)
    );
    if (edge) {
      pathEdges.push(edge);
    }
  }

  return buildSubgraph({
    graphData,
    nodeRefs,
    rootRef: pathRefs[0],
    targetRef: pathRefs[pathRefs.length - 1],
    maxEdges: pathEdges.length
  });
}

function buildNetworkSummary({ graphData, graph, store, mode, pathRefs = [] }) {
  const connectorScores = computeConnectorScores(graphData);
  const topConnectors = Array.from(connectorScores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([personRef]) => graphData.nodeMap.get(personRef)?.person_name)
    .filter(Boolean);

  const isolatedPeople = graphData.profiles
    .filter((profile) => !(graphData.adjacency.get(profile.person_ref) || []).length)
    .map((profile) => profile.person_name);

  const summary = {
    profile_count: store.profiles.length,
    edge_count: graphData.edges.length,
    top_connectors: topConnectors,
    isolated_people: isolatedPeople
  };

  if (mode === "find_connection_path") {
    summary.path_length = pathRefs.length;
  }
  if (graph?.nodes) {
    summary.graph_node_count = graph.nodes.length;
  }
  return summary;
}

function computeConnectorScores(graphData) {
  const scores = new Map();
  graphData.profiles.forEach((profile) => {
    const score = (graphData.adjacency.get(profile.person_ref) || []).reduce(
      (total, item) => total + item.edge.relation_score,
      0
    );
    scores.set(profile.person_ref, score);
  });
  return scores;
}

function buildInfluenceNotesForRoot(root, relatedPeople, graphData) {
  const notes = [];
  if (!relatedPeople.length) {
    notes.push(`${root.person_name} 当前在 store 内还没有形成足够清晰的关系边。`);
    return notes;
  }
  const connectorScores = computeConnectorScores(graphData);
  const rootScore = connectorScores.get(root.person_ref) || 0;
  const ranked = Array.from(connectorScores.values()).sort((left, right) => right - left);
  const topScore = ranked[0] || 0;
  if (rootScore === topScore) {
    notes.push(`${root.person_name} 当前是这批关系里的关键连接点之一。`);
  }
  const topNeighbor = relatedPeople[0];
  if (topNeighbor) {
    notes.push(`${topNeighbor.person_name} 是当前最强的相邻关系节点，适合作为后续优先对齐对象。`);
  }
  return uniqueStrings(notes);
}

function buildInfluenceNotesForPath(pathRefs, graphData) {
  if (pathRefs.length <= 2) {
    return ["两位人物在当前 store 中是直接连接关系。"];
  }
  const bridgeRefs = pathRefs.slice(1, -1);
  return bridgeRefs.map((personRef) => {
    const profile = graphData.nodeMap.get(personRef);
    return `${profile?.person_name || personRef} 是当前路径里的桥接节点。`;
  });
}

function buildGlobalInfluenceNotes(graphData) {
  const connectorScores = computeConnectorScores(graphData);
  const top = Array.from(connectorScores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([personRef]) => graphData.nodeMap.get(personRef)?.person_name)
    .filter(Boolean);
  if (!top.length) {
    return ["当前网络还比较稀疏，尚未形成明显的连接中心。"];
  }
  return [`当前网络最强的连接中心是：${top.join(" / ")}。`];
}

function buildGraphReviewBundle({ graph, graphData, mode }) {
  const edgeCandidates = (graph.edges || [])
    .map((edge) => buildReviewCandidate(edge, graphData, mode))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.review_priority !== left.review_priority) {
        return right.review_priority - left.review_priority;
      }
      return left.relation_score - right.relation_score;
    });

  return {
    required: edgeCandidates.length > 0,
    pending_edge_count: edgeCandidates.length,
    edge_candidates: edgeCandidates,
    review_notes: edgeCandidates.length
      ? ["以下关系边证据偏弱、主要基于共现，或节点档案置信度偏低，建议用户确认后再把它当成稳定关系。"]
      : ["当前图中的主要关系边证据较强，暂时没有必须人工确认的边。"]
  };
}

function buildReviewCandidate(edge, graphData, mode) {
  const sourceProfile = graphData.nodeMap.get(edge.source);
  const targetProfile = graphData.nodeMap.get(edge.target);
  if (!sourceProfile || !targetProfile) {
    return null;
  }

  if (edge.review_status && ["confirm", "downgrade", "reclassify"].includes(edge.review_status)) {
    return null;
  }
  if (edge.review_status === "reject") {
    return null;
  }

  const reviewReasons = [];
  let suggestedAction = "confirm_relation";
  let reviewPriority = 1;

  if (edge.relation_type === "same_source_context") {
    reviewReasons.push("这条边主要来自共享资料源，还缺少更直接的互相提及或稳定协作证据。");
    suggestedAction = "confirm_context_link";
    reviewPriority += 2;
  } else if (edge.relation_type === "shared_role") {
    reviewReasons.push("这条边主要来自共享标签或角色画像，更像同类人群，不一定代表真实关系。");
    suggestedAction = "confirm_or_downgrade";
    reviewPriority += 3;
  } else if (edge.relation_type === "weak_link") {
    reviewReasons.push("这条边目前只有弱信号支撑，容易把噪音或偶然共现误当成关系。");
    suggestedAction = "downgrade_or_ignore";
    reviewPriority += 4;
  } else if (edge.relation_type === "mentioned_together") {
    reviewReasons.push("这条边主要来自互相提及，适合确认是否真的是稳定关系或只是一次性讨论对象。");
    suggestedAction = "confirm_mention_link";
    reviewPriority += 1;
  }

  if (edge.relation_score <= 10) {
    reviewReasons.push("关系分数偏低，说明证据量有限。");
    reviewPriority += 2;
  }

  if (sourceProfile.confidence === "low" || targetProfile.confidence === "low") {
    reviewReasons.push("至少一侧人物档案置信度偏低，关系判断可能会被上游实体识别误差带偏。");
    suggestedAction = "check_entity_alignment";
    reviewPriority += 2;
  }

  if (sourceProfile.profile_tier === "stub" || targetProfile.profile_tier === "stub") {
    reviewReasons.push("至少一侧仍然是 stub 档案，信息量还不够厚。");
    reviewPriority += 1;
  }

  if (mode === "find_connection_path" && edge.relation_type !== "same_context_and_mentioned") {
    reviewReasons.push("这条边被用于连接路径，建议确认它是否足够强，避免路径看起来存在但实际不稳。");
    reviewPriority += 1;
  }

  if (!reviewReasons.length) {
    return null;
  }

  return {
    source_person_name: sourceProfile.person_name,
    source_person_ref: sourceProfile.person_ref,
    target_person_name: targetProfile.person_name,
    target_person_ref: targetProfile.person_ref,
    relation_type: edge.relation_type,
    relation_score: edge.relation_score,
    reason: reviewReasons.join(" "),
    suggested_action: suggestedAction,
    review_priority: reviewPriority
  };
}

function normalizeGraphReviewDecision(decision) {
  return {
    edge_key: normalizeString(decision.edge_key),
    source_person_ref: normalizeString(decision.source_person_ref),
    source_person_name: normalizeString(decision.source_person_name),
    target_person_ref: normalizeString(decision.target_person_ref),
    target_person_name: normalizeString(decision.target_person_name),
    final_action: normalizeGraphReviewAction(decision.final_action || "defer"),
    corrected_relation_type: normalizeNullableString(decision.corrected_relation_type),
    note: normalizeString(decision.note),
    operator: normalizeString(decision.operator),
    reviewed_at: normalizeString(decision.reviewed_at),
    relation_type: normalizeString(decision.relation_type),
    relation_score: Number.isFinite(Number(decision.relation_score)) ? Number(decision.relation_score) : 0
  };
}

function buildRenderArtifacts({ mode, graph, rootPerson, targetPerson, reviewBundle }) {
  return {
    format: "mermaid",
    graph_kind: mode,
    node_count: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edge_count: Array.isArray(graph?.edges) ? graph.edges.length : 0,
    mermaid: buildMermaidDiagram({ graph, mode, rootPerson, targetPerson, reviewBundle })
  };
}

function buildMermaidDiagram({ graph, mode, rootPerson, targetPerson, reviewBundle }) {
  const lines = ["flowchart LR"];
  const reviewKeys = new Set((reviewBundle?.edge_candidates || []).map((candidate) => edgeKey(candidate.source_person_ref, candidate.target_person_ref)));

  for (const node of graph?.nodes || []) {
    const nodeId = sanitizeMermaidId(node.person_ref);
    const tier = node.profile_tier ? `${node.profile_tier}` : "profile";
    const confidence = node.confidence ? ` / ${node.confidence}` : "";
    const label = escapeMermaidLabel(`${node.person_name}<br/>${tier}${confidence}`);
    lines.push(`  ${nodeId}["${label}"]`);
  }

  for (const edge of graph?.edges || []) {
    const sourceId = sanitizeMermaidId(edge.source);
    const targetId = sanitizeMermaidId(edge.target);
    const label = escapeMermaidLabel(`${edge.relation_score} · ${edge.relation_type}`);
    if (reviewKeys.has(edgeKey(edge.source, edge.target))) {
      lines.push(`  ${sourceId} -. "${label} ?" .-> ${targetId}`);
    } else {
      lines.push(`  ${sourceId} -- "${label}" --> ${targetId}`);
    }
  }

  for (const node of graph?.nodes || []) {
    const nodeId = sanitizeMermaidId(node.person_ref);
    if (rootPerson && node.person_ref === rootPerson.person_ref) {
      lines.push(`  class ${nodeId} rootNode`);
    } else if (targetPerson && node.person_ref === targetPerson.person_ref) {
      lines.push(`  class ${nodeId} targetNode`);
    } else {
      lines.push(`  class ${nodeId} defaultNode`);
    }
  }

  lines.push("  classDef rootNode fill:#0b6e4f,stroke:#084c38,color:#ffffff,stroke-width:2px");
  lines.push("  classDef targetNode fill:#1d4ed8,stroke:#1e40af,color:#ffffff,stroke-width:2px");
  lines.push("  classDef defaultNode fill:#f5f5f4,stroke:#a8a29e,color:#1c1917,stroke-width:1px");

  if ((reviewBundle?.edge_candidates || []).length) {
    lines.push("  %% Dashed edges with ? indicate relation edges that still need user confirmation.");
  }
  if (mode === "find_connection_path") {
    lines.push("  %% This graph highlights the currently inferred path between the two people.");
  }

  return lines.join("\n");
}

function sanitizeMermaidId(value) {
  const normalized = normalizeKey(value || "node");
  const safe = normalized.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "node";
}

function escapeMermaidLabel(value) {
  return String(value ?? "").replace(/"/g, '\\"');
}

function edgeKey(left, right) {
  return [left, right].map((item) => normalizeString(item)).sort().join("::");
}

function buildUserFeedbackForPersonGraph({ root, relatedPeople, graph, reviewBundle }) {
  const topNeighbor = relatedPeople[0];
  const headline = topNeighbor
    ? `已生成 ${root.person_name} 的局部关系图，当前最强连接人是 ${topNeighbor.person_name}`
    : `已生成 ${root.person_name} 的局部关系图，但当前还没有足够强的关系边`;

  const summaryLines = [
    `共纳入 ${graph.nodes.length} 个节点`,
    `识别出 ${graph.edges.length} 条关系边`,
    reviewBundle.pending_edge_count
      ? `其中 ${reviewBundle.pending_edge_count} 条边建议你先确认再当成稳定关系边`
      : "当前主要关系边看起来比较稳定"
  ];

  const keyFindings = [];
  if (topNeighbor) {
    keyFindings.push(`${topNeighbor.person_name} 是当前最强的一阶关系节点，关系强度 ${topNeighbor.relation_score}`);
  }
  if (relatedPeople.length > 1) {
    keyFindings.push(`${relatedPeople[1].person_name} 也是当前局部网络中的重要相邻节点`);
  }
  if (!keyFindings.length) {
    keyFindings.push(`当前资料还不足以为 ${root.person_name} 形成丰富的局部网络`);
  }

  return {
    headline,
    summary_lines: summaryLines,
    key_findings: keyFindings,
    confidence_notes: [
      "当前关系边主要基于共享资料源、互相提及和共享标签推断",
      "关系强度表示连接证据强弱，不等于私人亲密度"
    ],
    next_action: topNeighbor
      ? reviewBundle.pending_edge_count
        ? {
            type: "review_graph_edges",
            message: `建议优先确认 ${reviewBundle.pending_edge_count} 条关系边，然后再决定是否把 ${topNeighbor.person_name} 当成稳定相邻人物`
          }
        : {
            type: "follow_up",
            message: `建议继续补 ${root.person_name} 与 ${topNeighbor.person_name} 的后续互动资料，增强这条边的稳定性`
          }
      : {
          type: "add_evidence",
          message: `建议继续补 ${root.person_name} 的会议纪要或互动记录，先把局部网络补起来`
        }
  };
}

function buildUserFeedbackForPath({ root, target, pathRefs, graphData, reviewBundle }) {
  const pathNames = pathRefs
    .map((personRef) => graphData.nodeMap.get(personRef)?.person_name)
    .filter(Boolean);
  const direct = pathRefs.length <= 2;

  return {
    headline: direct
      ? `已找到 ${root.person_name} 与 ${target.person_name} 的直接连接`
      : `已找到 ${root.person_name} 到 ${target.person_name} 的连接路径`,
    summary_lines: [
      `路径长度为 ${pathRefs.length}`,
      direct ? "两人当前是直接相连" : `中间桥接节点为 ${pathNames.slice(1, -1).join(" / ")}`,
      reviewBundle.pending_edge_count
        ? `这条路径里有 ${reviewBundle.pending_edge_count} 条边建议你先核实`
        : "路径主要由较强的关系边支撑"
    ],
    key_findings: [
      direct
        ? `${root.person_name} 与 ${target.person_name} 当前在同一条关系边上`
        : `${pathNames.slice(1, -1).join(" / ")} 是当前路径中的关键桥接节点`
    ],
    confidence_notes: [
      "路径是基于当前 profile store 的已确认关系边计算得出",
      "如果后续资料变化，路径也可能发生变化"
    ],
    next_action: {
      type: reviewBundle.pending_edge_count
        ? "review_path_edges"
        : direct ? "use_direct_link" : "bridge_person",
      message: reviewBundle.pending_edge_count
        ? "建议先确认路径上的弱边，再决定这条路径是否能用于真实触达或关系判断"
        : direct
          ? `如果要联动 ${target.person_name}，可以直接把他视为一阶连接对象`
          : `如果要触达 ${target.person_name}，优先关注中间桥接节点的最新状态`
    }
  };
}

function buildUserFeedbackForSummary(graphData, graph, store, reviewBundle) {
  const summary = buildNetworkSummary({
    graphData,
    graph,
    store,
    mode: "summarize_network"
  });
  const topConnector = summary.top_connectors[0];

  return {
    headline: topConnector
      ? `已完成当前关系网络摘要，${topConnector} 是最强连接中心之一`
      : "已完成当前关系网络摘要，但网络还比较稀疏",
    summary_lines: [
      `当前共有 ${summary.profile_count} 份人物档案`,
      `推断出 ${summary.edge_count} 条关系边`,
      reviewBundle.pending_edge_count
        ? `其中 ${reviewBundle.pending_edge_count} 条边建议你做人工核实`
        : "当前全局网络主要由较强边组成"
    ],
    key_findings: topConnector
      ? [`当前最强连接中心包括：${summary.top_connectors.join(" / ")}`]
      : ["当前还没有形成明显的网络中心"],
    confidence_notes: [
      "全局网络摘要只基于当前已确认档案，不代表全部真实关系",
      "边数量和中心度会随着新资料导入持续变化"
    ],
    next_action: {
      type: reviewBundle.pending_edge_count ? "review_network_edges" : "expand_network",
      message: reviewBundle.pending_edge_count
        ? `建议优先核实 ${reviewBundle.pending_edge_count} 条关系边，再决定哪些人物真的属于你的桥接网络`
        : summary.isolated_people.length
          ? `建议优先补这些孤立人物的后续资料：${summary.isolated_people.slice(0, 3).join(" / ")}`
          : "建议继续补关键人物之间的互动资料，提升桥接边质量"
    }
  };
}

function emptyResponse({ mode, note }) {
  return {
    status: "needs_review",
    mode,
    root_person: null,
    target_person: null,
    related_people: [],
    connection_path: [],
    graph: { nodes: [], edges: [] },
    network_summary: {
      profile_count: 0,
      edge_count: 0,
      top_connectors: [],
      isolated_people: []
    },
    influence_notes: [],
    review_bundle: {
      required: false,
      pending_edge_count: 0,
      edge_candidates: [],
      review_notes: ["当前还没有足够的图谱数据，无法进行关系边核实。"]
    },
    render_artifacts: {
      format: "mermaid",
      graph_kind: "empty",
      node_count: 0,
      edge_count: 0,
      mermaid: 'flowchart LR\n  empty["暂无可视化图谱"]'
    },
    user_feedback: {
      headline: "当前还无法生成有效关系图",
      summary_lines: [],
      key_findings: [],
      confidence_notes: ["当前资料不足，或目标人物尚未命中现有档案"],
      next_action: {
        type: "review_input",
        message: "建议先确认人物输入是否正确，或补充更多已确认资料"
      }
    },
    notes: note
  };
}

function buildPersonCard(profile) {
  return {
    person_name: profile.person_name,
    person_ref: profile.person_ref,
    profile_tier: profile.profile_tier
  };
}

function persistRunArtifacts({ request, response }) {
  mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = normalizeKey(
    request.person_ref ||
    request.person_name ||
    request.target_person_ref ||
    request.target_person_name ||
    request.mode ||
    "graph"
  ).replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId || "graph"}`);
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "response.json"), `${JSON.stringify(response, null, 2)}\n`, "utf8");
  return runDirectory;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeGraphReviewAction(value) {
  const candidate = normalizeKey(value);
  if (["confirm", "reject", "downgrade", "reclassify", "defer"].includes(candidate)) {
    return candidate;
  }
  return "defer";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((item) => normalizeString(item)).filter(Boolean)));
}

function clampInteger(value, fallback, min, max) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(candidate)));
}

