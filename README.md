# Obsidian Todoist Sync Plugin

A comprehensive bidirectional sync plugin that mirrors your entire Todoist workspace in Obsidian. Each task, project, and section becomes a dedicated note with YAML frontmatter properties.

## Features

- **Complete Workspace Mirror**: Every Todoist task, project, and section becomes an Obsidian note
- **Bidirectional Sync**: Changes in either Obsidian or Todoist are synchronized
- **YAML Frontmatter**: Task properties stored as structured YAML metadata  
- **Organized Folder Structure**: Automatic folder organization by projects and sections
- **Configurable Properties**: Choose which Todoist fields to include in notes
- **Real-time Change Detection**: File modifications trigger sync updates
- **API Token Authentication**: Simple token-based authentication
- **Dual API Support**: Uses Todoist REST API v2 for reliability with Sync API v9 fallback

## Architecture

The plugin uses a dual-state system:

- **Source A (TodoistState)**: Current state from Todoist Sync API
- **Source B (ObsidianState)**: Current state parsed from Obsidian notes
- **Sync Engine**: Reconciles differences between the two sources

### File Organization

```
TodoistSync/
├── ProjectName/
│   ├── _project.md              # Project metadata
│   ├── SectionName/
│   │   ├── _section.md          # Section metadata
│   │   ├── Task 1.md            # Individual tasks
│   │   └── Task 2.md
│   └── Unsectioned Task.md      # Tasks not in sections
└── Another Project/
    └── ...
```

## Setup

1. **Get Todoist API Token**:
   - Go to [Todoist Integrations](https://todoist.com/prefs/integrations)
   - Copy your API token

2. **Configure Plugin**:
   - Open Obsidian Settings > Todoist Sync
   - Paste your API token
   - Set sync folder path (default: "TodoistSync")
   - Choose scope tag (default: "todoist")
   - Configure which properties to include

3. **First Sync**:
   - Use Command Palette: "Sync with Todoist"
   - Or click the sync ribbon icon
   - Or use Command Palette: "Test Todoist Connection" first

## Usage

### Manual Sync
- **Ribbon Icon**: Click the sync icon in the left ribbon
- **Command Palette**: "Sync with Todoist"
- **Status Bar**: Shows last sync time and status

### Automatic Sync  
- Configure auto-sync interval in settings (1-60 minutes)
- Disable by setting interval to 0

### Viewing Statistics
- Command Palette: "Show Sync Statistics"
- Displays counts of tasks, projects, sections in both systems

### Note Structure

Each task note includes:
```yaml
---
todoist_id: "123456789"
title: "Buy groceries"
due_date: "2025-11-15"
priority: 2
labels: ["shopping", "urgent"]
todoist_project: "Personal"
todoist_section: "Errands"
completed: false
sync_status: "synced"
last_sync: "2025-11-14T10:30:00.000Z"
---
#todoist

# Buy groceries

Task description here...

[ ] Buy groceries

## Task Details
**Due:** Nov 15
**Priority:** Medium
**Labels:** shopping, urgent
```

## Development

### Building
```bash
npm install
npm run build
```

### Development Mode
```bash
npm run dev
```

### File Structure
```
src/
├── main.ts                 # Plugin entry point
├── api/
│   └── todoistSync.ts      # Todoist Sync API client
├── models/
│   └── types.ts            # TypeScript interfaces
├── state/
│   ├── todoistState.ts     # Source A (Todoist data)
│   └── obsidianState.ts    # Source B (Obsidian notes)
├── obsidian/
│   └── fileGenerator.ts    # Note creation/updates
└── sync/
    └── syncEngine.ts       # Main sync coordination
```

## Configuration Options

### Property Mapping
Choose which Todoist properties to include:
- **Content**: Task title/description
- **Due Date**: Due dates and times  
- **Priority**: Priority levels (1-4)
- **Labels**: Task tags/labels
- **Project**: Project association
- **Section**: Section within project

### Sync Settings
- **API Token**: Your Todoist personal API token
- **Sync Folder**: Where to create Todoist notes (default: "TodoistSync")  
- **Scope Tag**: Tag to identify sync notes (default: "todoist")
- **Auto Sync**: Automatic sync interval in minutes (0 to disable)

## Troubleshooting

### Connection Issues
1. Verify API token is correct
2. Check internet connection
3. Use "Test Todoist Connection" command

### Sync Issues
1. Check status bar for error messages
2. Verify sync folder exists and is writable
3. Ensure no conflicting plugins modify the same files
4. Check browser console for detailed error logs

### Performance
- Large workspaces (1000+ tasks) may take 30-60 seconds for initial sync
- Incremental syncs are much faster (2-5 seconds)
- Consider reducing auto-sync frequency for very large workspaces

## Limitations

- Requires internet connection for sync
- Todoist API rate limits (450 requests per 15 minutes)
- Large file operations may temporarily slow Obsidian
- Nested projects limited to Obsidian folder depth limits

## Roadmap

- [ ] Conflict resolution UI for manual conflict handling
- [ ] Selective sync (choose specific projects)  
- [ ] Comment synchronization
- [ ] Webhook support for real-time updates
- [ ] Bulk import/export tools
- [ ] Custom note templates

## Support

For issues, feature requests, or questions:
- Create an issue in the GitHub repository
- Check existing issues for solutions
- Provide sync logs and error messages when reporting bugs

## License

MIT License - see LICENSE file for details.