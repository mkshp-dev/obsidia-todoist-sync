# Plan: Obsidian–Todoist Workspace Mirror Plugin

Build a bidirectional sync system where each Todoist task/project/section becomes an Obsidian note with YAML properties. Maintain two synchronized sources (Todoist state vs Obsidian state) and reconcile changes in both directions using the Todoist Sync API and file watchers.

## Design Architecture

### Core Concept
1. **One task = One note**: Each Todoist task corresponds to a single Obsidian note with YAML frontmatter containing task parameters
2. **Project/Section notes**: Projects and sections also become notes for complete workspace mirroring
3. **Dual state management**: 
   - **Source A**: Current Todoist state (from Sync API)
   - **Source B**: Current Obsidian state (parsed from files)
4. **Bidirectional sync**: Changes in either direction trigger reconciliation

### Sync Flow
#### Todoist → Obsidian
1. Sync API fetch updates Source A
2. Compare Source A vs Source B
3. Use Obsidian API to create/update files to match Source A

#### Obsidian → Todoist  
1. File changes detected via watchers
2. Update Source B from changed files
3. Compare Source B vs Source A
4. Make Todoist API calls to sync changes

### User Configuration
- API token authentication
- Configurable property mapping (which Todoist fields to include)
- Scope definition via tags (e.g., `#todoist`)
- Folder structure preferences

## Implementation Steps

### Step 1: Project Setup & Sample Plugin
- Initialize from Obsidian sample plugin template
- Create `manifest.json`, `package.json`, `esbuild.config.mjs`
- Basic `src/main.ts` plugin entry point

### Step 2: Todoist Sync API Client
- Implement `src/api/todoistSync.ts`
- Incremental sync with `sync_token` management
- Full resource fetching (tasks, projects, sections)
- Rate limiting and error handling

### Step 3: State Management
- Create `src/state/sourceA.ts` (Todoist state)
- Create `src/state/sourceB.ts` (Obsidian state)  
- Define `src/models/` for Task/Project/Section data models
- State comparison utilities

### Step 4: File Generation Engine
- Build `src/obsidian/fileGenerator.ts` for note creation/updates
- Implement `src/obsidian/folderStructure.ts` for project hierarchy
- YAML frontmatter generation and parsing

### Step 5: Change Detection & Sync
- Implement `src/sync/syncEngine.ts` with bidirectional reconciliation
- Create `src/sync/changeDetector.ts` for file watchers
- Conflict resolution strategies

### Step 6: Settings & UI
- Add `src/ui/settingsTab.ts` for configuration
- API token management
- Property mapping preferences
- Scope tag configuration

## Technical Considerations

### File Organization
- Recommend project-based folders: `/TodoistSync/ProjectName/TaskName.md`
- Alternative: flat structure with naming convention

### Property Mapping
- User-configurable Todoist fields (content, due_date, priority, labels)
- Sensible defaults with override options

### Scope Definition  
- Tag-based scoping (`#todoist`) for flexibility
- Alternative: folder location or frontmatter flags

### Conflict Resolution
- Timestamp comparison as primary method
- User override options for complex conflicts
- Last-writer-wins as fallback

## Risks & Mitigation

### Technical Risks
- **Todoist API rate limits**: Implement exponential backoff
- **Large workspace performance**: Incremental sync, batching
- **File system conflicts**: Atomic operations, backup mechanisms

### User Experience Risks
- **Data loss**: Comprehensive backup before sync operations
- **Complex setup**: Sensible defaults, progressive disclosure
- **Sync confusion**: Clear status indicators, detailed logging

## Success Metrics
- Reliable bidirectional sync without data loss
- Performance: <2s sync time for 100+ tasks
- User adoption: Clear setup flow, intuitive configuration
- Community feedback: Active usage, positive reviews
