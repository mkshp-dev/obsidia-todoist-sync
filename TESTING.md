# Testing & Debug Guide

## 🔧 Debug Features Added

### 1. **Comprehensive Logging System**
- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Performance Timing**: Automatic operation timing
- **Structured Data**: JSON formatting for complex data
- **Export/Import**: Save logs to file or clipboard

### 2. **Debug Mode**
- **Toggle**: Settings > Debug Mode or Command Palette
- **Visual Feedback**: Debug notifications in Obsidian
- **Detailed Console Logs**: Enhanced browser console output
- **Real-time Monitoring**: Live sync progress updates

### 3. **New Commands Available**

| Command | Purpose |
|---------|---------|
| `Toggle Debug Mode` | Enable/disable debug logging |
| `Show Debug Logs` | View logs in modal with filtering |
| `Dry Run Sync` | Preview changes without modifications |
| `Validate Todoist Data` | Check data integrity |
| `Test Todoist Connection` | Verify API connectivity |

### 4. **Data Validation**
- **API Response Validation**: Ensures valid data structures
- **Task/Project/Section Validation**: Filters invalid items
- **File Path Sanitization**: Safe file naming
- **Error Recovery**: Graceful handling of invalid data

## 🚀 Testing Steps

### Step 1: Enable Debug Mode
1. Open **Settings** > **Todoist Sync**
2. Turn on **Debug Mode**
3. Check browser console (F12) for detailed logs

### Step 2: Test Connection
1. Enter your Todoist API token in settings
2. Click **Test Connection** button in settings
3. Or use Command Palette: "Test Todoist Connection"
4. Check for success/error messages

### Step 3: Validate Your Data
1. Use Command Palette: "Validate Todoist Data"
2. Check console for data statistics and any validation issues
3. Review the output for:
   - Number of tasks, projects, sections
   - Any invalid data filtered out
   - Connection status

### Step 4: Dry Run Sync
1. Use Command Palette: "Dry Run Sync (Preview Changes)"
2. This will fetch data but NOT create files
3. Check console/logs to see what would be created
4. Look for potential issues before real sync

### Step 5: View Debug Logs
1. Use Command Palette: "Show Debug Logs"
2. Review recent operations and any errors
3. Use **Export Logs** to save for troubleshooting
4. **Clear Logs** to start fresh

### Step 6: First Real Sync
1. Make sure Debug Mode is ON
2. Use Command Palette: "Sync with Todoist"
3. Watch the status bar for progress
4. Check the sync folder for created files

## 🔍 What to Look For

### Success Indicators
- ✅ Connection test passes
- ✅ Data validation shows your task/project counts
- ✅ Dry run completes without errors
- ✅ Files are created in the correct folder structure
- ✅ YAML frontmatter is properly formatted

### Common Issues to Debug

#### 1. **Connection Issues**
- **Error**: "Request failed, status XXX"
- **Check**: API token is correct, internet connection
- **Debug**: Look at console for detailed error messages

#### 2. **Data Structure Issues**
- **Error**: "Invalid response format"
- **Check**: Your Todoist data might have unexpected formats
- **Debug**: Check validation logs for filtered items

#### 3. **File Creation Issues**
- **Error**: "Cannot create file"
- **Check**: Sync folder permissions, file name conflicts
- **Debug**: Check file path validation in logs

#### 4. **Performance Issues**
- **Error**: Slow sync operations (>5 seconds)
- **Check**: Large amount of data, network speed
- **Debug**: Check timing logs for bottlenecks

## 📋 Debug Data Collection

When reporting issues, please provide:

1. **Settings Configuration**:
   - Sync folder path
   - Enabled properties
   - Debug mode status

2. **Debug Logs** (use Export Logs):
   - Recent sync attempts
   - Error messages
   - Performance timings

3. **Todoist Data Stats**:
   - Number of tasks, projects, sections
   - Any special characters in names
   - Nested project structures

4. **Environment Info**:
   - Obsidian version
   - Operating system
   - Network conditions

## 🛠️ Quick Fixes

### Reset Plugin State
1. Turn off debug mode
2. Clear logs
3. Restart Obsidian
4. Re-enable debug mode and test

### Clean Sync Folder
1. Backup any important notes
2. Delete sync folder contents
3. Run fresh sync

### Token Issues
1. Get fresh API token from Todoist
2. Test connection again
3. Check token permissions

## 📊 Expected Output

### Successful Dry Run Log Example:
```
[INFO] 🔄 Starting sync operation: Fetch Projects
[INFO] ✅ Completed sync operation: Fetch Projects in 234ms
[INFO] 🔄 Starting sync operation: Fetch Tasks  
[INFO] ✅ Completed sync operation: Fetch Tasks in 456ms
[INFO] Dry run would create 15 task files, 3 project files
```

### Successful Real Sync:
```
[INFO] Generated/updated 15 task files, 3 project files, 2 section files
[INFO] ✅ Sync completed successfully
```

Ready to test! Start with enabling debug mode and testing the connection.