-- ============================================================
--  REQGEN SYSTEM — FULL DATABASE SCHEMA
--  IEEE 29148 Compliant Requirement Management System
--  Version: 1.0.0
-- ============================================================

-- ============================================================
--  EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- Password hashing


-- ============================================================
--  ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
    'admin',
    'requirement_engineer',
    'domain_expert',
    'stakeholder',
    'viewer'
);

CREATE TYPE project_status AS ENUM (
    'active',
    'archived',
    'completed',
    'on_hold'
);

CREATE TYPE requirement_type AS ENUM (
    'functional',
    'non_functional',
    'constraint',
    'interface',
    'performance',
    'security',
    'usability',
    'reliability',
    'maintainability',
    'portability'
);

CREATE TYPE requirement_status AS ENUM (
    'draft',            -- AI generated, not yet reviewed
    'under_review',     -- Sent to human reviewer
    'approved',         -- Approved by engineer/expert
    'rejected',         -- Rejected, needs rework
    'deprecated',       -- No longer relevant
    'implemented'       -- Confirmed built
);

CREATE TYPE priority_level AS ENUM (
    'must_have',        -- MoSCoW: M
    'should_have',      -- MoSCoW: S
    'could_have',       -- MoSCoW: C
    'wont_have'         -- MoSCoW: W
);

CREATE TYPE conversation_status AS ENUM (
    'active',
    'completed',
    'abandoned'
);

CREATE TYPE message_sender AS ENUM (
    'user',
    'bot'
);

CREATE TYPE review_decision AS ENUM (
    'approved',
    'rejected',
    'needs_revision'
);

CREATE TYPE export_format AS ENUM (
    'json',
    'excel',
    'word',
    'pdf',
    'jira',
    'doors'
);

CREATE TYPE change_type AS ENUM (
    'created',
    'updated',
    'deleted',
    'status_changed',
    'priority_changed',
    'approved',
    'rejected'
);

CREATE TYPE nfr_category AS ENUM (
    'performance',
    'security',
    'usability',
    'reliability',
    'scalability',
    'maintainability',
    'portability',
    'availability',
    'compliance'
);


-- ============================================================
--  TABLE 1: USERS
--  Stores all system users across all roles
-- ============================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    role                user_role NOT NULL DEFAULT 'stakeholder',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_login          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);


-- ============================================================
--  TABLE 2: PROJECTS
--  A project groups all requirements for one software system
-- ============================================================
CREATE TABLE projects (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    domain              VARCHAR(100),               -- e.g. "Healthcare", "Finance"
    status              project_status NOT NULL DEFAULT 'active',
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);


-- ============================================================
--  TABLE 3: PROJECT MEMBERS
--  Many-to-many: users can belong to multiple projects
-- ============================================================
CREATE TABLE project_members (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                user_role NOT NULL DEFAULT 'stakeholder',
    joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);


-- ============================================================
--  TABLE 4: CONVERSATIONS (Rasa dialogue sessions)
--  Each conversation = one user session with the chatbot
-- ============================================================
CREATE TABLE conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rasa_session_id     VARCHAR(255) UNIQUE,        -- Rasa's internal session ID
    status              conversation_status NOT NULL DEFAULT 'active',
    context             JSONB DEFAULT '{}',         -- Rasa slot values, entities collected
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);


-- ============================================================
--  TABLE 5: MESSAGES
--  Every message in every conversation, user and bot
-- ============================================================
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender              message_sender NOT NULL,
    content             TEXT NOT NULL,
    intent              VARCHAR(100),               -- Rasa detected intent
    confidence          NUMERIC(5,4),               -- Rasa confidence score 0.0000–1.0000
    entities            JSONB DEFAULT '[]',         -- Rasa extracted entities
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender);


-- ============================================================
--  TABLE 6: USER STORIES (Raw Input)
--  The raw stakeholder inputs before NLP processing
-- ============================================================
CREATE TABLE user_stories (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,
    submitted_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    raw_text            TEXT NOT NULL,              -- Exactly what the user typed
    domain_context      VARCHAR(100),               -- e.g. "authentication", "payments"
    goals               TEXT[],                     -- Array of extracted goals
    actors              TEXT[],                     -- Array of identified actors
    constraints         TEXT[],                     -- Array of identified constraints
    metadata            JSONB DEFAULT '{}',         -- Any extra context
    processed           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_stories_project ON user_stories(project_id);
CREATE INDEX idx_user_stories_processed ON user_stories(processed);


-- ============================================================
--  TABLE 7: NLP PROCESSING JOBS
--  Tracks every NLP inference run against a user story
-- ============================================================
CREATE TABLE nlp_jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_story_id       UUID NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
    model_used          VARCHAR(100),               -- e.g. "deberta-v3-base"
    spacy_output        JSONB DEFAULT '{}',         -- Raw spaCy pipeline output
    transformer_output  JSONB DEFAULT '{}',         -- Raw HuggingFace model output
    tokens              TEXT[],                     -- Tokenized input
    named_entities      JSONB DEFAULT '[]',         -- NER results
    dependency_parse    JSONB DEFAULT '{}',         -- spaCy dep parse
    semantic_roles      JSONB DEFAULT '{}',         -- SRL output (AllenNLP later)
    processing_time_ms  INTEGER,                    -- Performance tracking
    success             BOOLEAN NOT NULL DEFAULT FALSE,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nlp_jobs_story ON nlp_jobs(user_story_id);
CREATE INDEX idx_nlp_jobs_success ON nlp_jobs(success);


-- ============================================================
--  TABLE 8: REQUIREMENTS (Core Table — IEEE 29148)
--  The main requirements table. Every field maps to IEEE 29148
-- ============================================================
CREATE TABLE requirements (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    user_story_id           UUID REFERENCES user_stories(id) ON DELETE SET NULL,
    nlp_job_id              UUID REFERENCES nlp_jobs(id) ON DELETE SET NULL,

    -- IEEE 29148 FIELDS --
    req_id                  VARCHAR(50) NOT NULL,   -- e.g. "REQ-001", "FR-042"
    title                   VARCHAR(500) NOT NULL,
    statement               TEXT NOT NULL,          -- The actual requirement sentence
    type                    requirement_type NOT NULL,
    rationale               TEXT,                   -- Why this requirement exists
    fit_criterion           TEXT,                   -- How to test/verify it
    originator              VARCHAR(255),           -- Who raised this requirement

    -- CLASSIFICATION --
    status                  requirement_status NOT NULL DEFAULT 'draft',
    priority                priority_level NOT NULL DEFAULT 'should_have',
    version                 INTEGER NOT NULL DEFAULT 1,
    is_current_version      BOOLEAN NOT NULL DEFAULT TRUE,

    -- SCORING (for prioritization layer) --
    business_value_score    SMALLINT CHECK (business_value_score BETWEEN 1 AND 5),
    risk_score              SMALLINT CHECK (risk_score BETWEEN 1 AND 5),
    cost_effort_score       SMALLINT CHECK (cost_effort_score BETWEEN 1 AND 5),
    stakeholder_importance  SMALLINT CHECK (stakeholder_importance BETWEEN 1 AND 5),
    weighted_score          NUMERIC(6,3),           -- Computed composite score

    -- QA SCORES (from QA layer) --
    ambiguity_score         NUMERIC(5,4),           -- 0 = clear, 1 = very ambiguous
    completeness_score      NUMERIC(5,4),
    consistency_score       NUMERIC(5,4),
    testability_score       NUMERIC(5,4),
    overall_quality_score   NUMERIC(5,4),
    qa_issues               JSONB DEFAULT '[]',     -- Array of flagged issues
    qa_confidence           NUMERIC(5,4),

    -- AI METADATA --
    ai_generated            BOOLEAN NOT NULL DEFAULT TRUE,
    ai_confidence           NUMERIC(5,4),

    -- AUDIT --
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(project_id, req_id, version)
);

CREATE INDEX idx_requirements_project ON requirements(project_id);
CREATE INDEX idx_requirements_status ON requirements(status);
CREATE INDEX idx_requirements_type ON requirements(type);
CREATE INDEX idx_requirements_priority ON requirements(priority);
CREATE INDEX idx_requirements_current ON requirements(is_current_version);
CREATE INDEX idx_requirements_req_id ON requirements(req_id);


-- ============================================================
--  TABLE 9: NON-FUNCTIONAL REQUIREMENT DETAILS
--  Extended attributes specific to NFRs (extends requirements)
-- ============================================================
CREATE TABLE nfr_details (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requirement_id      UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    nfr_category        nfr_category NOT NULL,
    metric              VARCHAR(255),               -- e.g. "response time", "uptime"
    target_value        VARCHAR(255),               -- e.g. "< 2 seconds", "99.9%"
    measurement_method  TEXT,
    UNIQUE(requirement_id)
);


-- ============================================================
--  TABLE 10: REQUIREMENT DEPENDENCIES
--  Tracks which requirements depend on or conflict with others
-- ============================================================
CREATE TABLE requirement_dependencies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requirement_id      UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    depends_on_id       UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    dependency_type     VARCHAR(50) DEFAULT 'depends_on',  -- 'depends_on', 'conflicts_with', 'extends', 'refines'
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (requirement_id != depends_on_id),
    UNIQUE(requirement_id, depends_on_id)
);

CREATE INDEX idx_req_deps_req ON requirement_dependencies(requirement_id);
CREATE INDEX idx_req_deps_depends ON requirement_dependencies(depends_on_id);


-- ============================================================
--  TABLE 11: REVIEWS (Human-in-the-Loop Layer)
--  Every human review action on a requirement
-- ============================================================
CREATE TABLE reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requirement_id      UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    reviewer_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision            review_decision NOT NULL,
    comments            TEXT,
    suggested_changes   TEXT,                       -- What the reviewer wants changed
    reviewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_requirement ON reviews(requirement_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_decision ON reviews(decision);


-- ============================================================
--  TABLE 12: AUDIT LOG / CHANGE HISTORY (Traceability Layer)
--  Immutable log of every change to every requirement
-- ============================================================
CREATE TABLE audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id      UUID REFERENCES requirements(id) ON DELETE SET NULL,
    changed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    change_type         change_type NOT NULL,
    field_changed       VARCHAR(100),               -- Which field was changed
    old_value           TEXT,
    new_value           TEXT,
    change_reason       TEXT,
    snapshot            JSONB,                      -- Full requirement state at time of change
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_project ON audit_log(project_id);
CREATE INDEX idx_audit_requirement ON audit_log(requirement_id);
CREATE INDEX idx_audit_changed_by ON audit_log(changed_by);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);


-- ============================================================
--  TABLE 13: TRACEABILITY MATRIX (RTM)
--  Links requirements back to their source user stories
--  and forward to test cases / implementation artefacts
-- ============================================================
CREATE TABLE traceability_matrix (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id      UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    user_story_id       UUID REFERENCES user_stories(id) ON DELETE SET NULL,
    test_case_ref       VARCHAR(255),               -- External test case ID (e.g. Jira ticket)
    implementation_ref  VARCHAR(255),               -- Git commit, PR, or module name
    verification_method VARCHAR(100),               -- 'test', 'inspection', 'analysis', 'demonstration'
    verified            BOOLEAN DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, requirement_id)
);

CREATE INDEX idx_rtm_project ON traceability_matrix(project_id);
CREATE INDEX idx_rtm_requirement ON traceability_matrix(requirement_id);


-- ============================================================
--  TABLE 14: EXPORTS
--  Tracks every document export from the system
-- ============================================================
CREATE TABLE exports (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    exported_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    format              export_format NOT NULL,
    file_name           VARCHAR(255),
    file_path           TEXT,                       -- Local or cloud storage path
    requirement_ids     UUID[],                     -- Which requirements were exported
    export_config       JSONB DEFAULT '{}',         -- Any filters or settings used
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exports_project ON exports(project_id);


-- ============================================================
--  TRIGGERS: auto-update updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_requirements_updated_at
    BEFORE UPDATE ON requirements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rtm_updated_at
    BEFORE UPDATE ON traceability_matrix
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
--  TRIGGER: Auto-generate req_id per project
--  Format: FR-001 (functional), NFR-001 (non-functional), etc.
-- ============================================================
CREATE OR REPLACE FUNCTION generate_req_id()
RETURNS TRIGGER AS $$
DECLARE
    prefix      VARCHAR(10);
    next_num    INTEGER;
    padded_num  VARCHAR(5);
BEGIN
    -- Determine prefix from type
    prefix := CASE NEW.type
        WHEN 'functional'       THEN 'FR'
        WHEN 'non_functional'   THEN 'NFR'
        WHEN 'constraint'       THEN 'CON'
        WHEN 'interface'        THEN 'IFR'
        WHEN 'performance'      THEN 'PER'
        WHEN 'security'         THEN 'SEC'
        WHEN 'usability'        THEN 'USR'
        WHEN 'reliability'      THEN 'REL'
        WHEN 'maintainability'  THEN 'MNT'
        WHEN 'portability'      THEN 'PRT'
        ELSE 'REQ'
    END;

    -- Count existing requirements of this type in this project
    SELECT COUNT(*) + 1
    INTO next_num
    FROM requirements
    WHERE project_id = NEW.project_id
      AND type = NEW.type;

    padded_num := LPAD(next_num::TEXT, 3, '0');
    NEW.req_id := prefix || '-' || padded_num;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_req_id
    BEFORE INSERT ON requirements
    FOR EACH ROW
    WHEN (NEW.req_id IS NULL OR NEW.req_id = '')
    EXECUTE FUNCTION generate_req_id();


-- ============================================================
--  TRIGGER: Log requirement changes to audit_log automatically
-- ============================================================
CREATE OR REPLACE FUNCTION log_requirement_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (project_id, requirement_id, changed_by, change_type, snapshot)
        VALUES (NEW.project_id, NEW.id, NEW.created_by, 'created', row_to_json(NEW));

    ELSIF TG_OP = 'UPDATE' THEN
        -- Log status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO audit_log (project_id, requirement_id, change_type, field_changed, old_value, new_value, snapshot)
            VALUES (NEW.project_id, NEW.id, 'status_changed', 'status', OLD.status::TEXT, NEW.status::TEXT, row_to_json(NEW));
        END IF;

        -- Log priority changes
        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO audit_log (project_id, requirement_id, change_type, field_changed, old_value, new_value, snapshot)
            VALUES (NEW.project_id, NEW.id, 'priority_changed', 'priority', OLD.priority::TEXT, NEW.priority::TEXT, row_to_json(NEW));
        END IF;

        -- Log general updates
        IF OLD.statement IS DISTINCT FROM NEW.statement
            OR OLD.title IS DISTINCT FROM NEW.title THEN
            INSERT INTO audit_log (project_id, requirement_id, change_type, field_changed, snapshot)
            VALUES (NEW.project_id, NEW.id, 'updated', 'statement/title', row_to_json(NEW));
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (project_id, requirement_id, change_type, snapshot)
        VALUES (OLD.project_id, OLD.id, 'deleted', row_to_json(OLD));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_requirements
    AFTER INSERT OR UPDATE OR DELETE ON requirements
    FOR EACH ROW EXECUTE FUNCTION log_requirement_changes();
