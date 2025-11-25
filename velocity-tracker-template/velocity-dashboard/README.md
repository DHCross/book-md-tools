# Velocity Dashboard - Enhanced with Time Tracking

This dashboard visualizes your development velocity and compares AI-assisted development against traditional solo development estimates.

## New Features

### 📊 Time Tracking Comparison
- **Hours Clocked**: Your actual logged work time
- **Est. Solo Time**: Estimated hours if developed traditionally (3.5× multiplier)
- **Velocity Multiplier**: How much faster AI-assisted development is vs solo

### 📈 Enhanced Metrics
- **Active Commit Rate**: Commits per actual work hour (not calendar time)
- **Time Saved**: Hours saved compared to traditional development
- **Efficiency Gain**: Percentage reduction in development time

### 📉 Visual Comparison
The chart now shows:
- AI-Assisted (Actual) vs Traditional Solo Est.
- Hours worked comparison
- Active commit rate vs estimated solo rate
- Calendar commit rate (commits per elapsed calendar hour)

## How to Use

### 1. Update Time Tracking Data

Edit `velocity-tracker-template/velocity-artifacts/velocity-summary.json` and update the `time_tracking` section:

```json
{
  "time_tracking": {
    "actual_hours": 27.9,
    "estimated_solo_hours": 97.65,
    "velocity_multiplier": 3.5,
    "sessions": [
      { "duration": "02:38:12", "hours": 2.64 }
    ]
  }
}
```

**Fields:**
- `actual_hours`: Total hours you actually worked (from time tracker)
- `estimated_solo_hours`: `actual_hours × 3.5` (or your custom multiplier)
- `velocity_multiplier`: Calculated speedup factor (3-4× is typical for AI-assisted dev)
- `sessions`: Optional breakdown of individual work sessions

### 2. Open the Dashboard

Simply open `index.html` in your browser:

```bash
cd velocity-tracker-template/velocity-dashboard
open index.html
```

Or use a local server:

```bash
python3 -m http.server 8000
# Then visit http://localhost:8000
```

### 3. Export the Report

Click the "Export Report" button (coming soon) to generate a PDF or shareable HTML report.

## Understanding the Metrics

### Calendar vs Active Time

**Calendar Time (165 hours)**:
- Time between first and last commit
- Includes nights, weekends, gaps
- Used by velocity-tracker script
- **NOT actual work time**

**Active Time (27.9 hours)**:
- From your time-tracking software
- Actual logged work sessions
- **True billable hours**

### Velocity Multiplier Calculation

```
Velocity Multiplier = Estimated Solo Hours ÷ Actual Hours
                    = 97.65 ÷ 27.9
                    = 3.5×
```

This means AI-assisted development was **3.5× faster** than traditional solo development would have been.

### Active Commit Rate

```
Active Commit Rate = Total Commits ÷ Actual Hours
                   = 54 ÷ 27.9
                   = 1.94 commits/hour
```

This is your **true development velocity** during active work sessions.

## Example: November 2025 Project

**Your Stats:**
- Actual hours: 27.9 hours (from time tracker)
- Commits: 54
- Active commit rate: 1.94 commits/hour
- Estimated solo time: ~98 hours
- **Time saved: 70 hours (72% faster!)**

**Work Pattern:**
- 10 sessions over 3+ weeks
- Largest session: 9.5 hours
- Shortest session: 39 minutes
- Calendar span: 23 days (Nov 2-25)

## Customization

### Adjust the Velocity Multiplier

The default is **3.5×** based on industry research for AI-assisted development. You can adjust this based on your experience:

- **2-3×**: Simple CRUD apps, straightforward features
- **3-4×**: Complex features with AI pair programming
- **4-5×**: Repetitive tasks, boilerplate generation
- **5-10×**: Code migrations, refactoring, test generation

Edit the multiplier in `app.js` or update the JSON directly.

### Add More Metrics

The dashboard is extensible. You can add:
- Lines of code metrics
- Test coverage changes
- Bug fix rates
- Code quality scores

Just update the JSON structure and add corresponding UI elements.

## Troubleshooting

**Dashboard shows "--" for all values:**
- Check that `velocity-summary.json` exists in `../velocity-artifacts/`
- Verify the JSON is valid (use JSONLint)
- Check browser console for errors

**Time tracking data not showing:**
- Make sure `time_tracking` object exists in the JSON
- Verify `actual_hours` is a number, not a string

**Chart not rendering:**
- Check that Chart.js loaded (see browser console)
- Verify data structure matches expected format

## Future Enhancements

- [ ] Real-time updates from velocity tracker
- [ ] Historical trend visualization
- [ ] Session-by-session breakdown view
- [ ] PDF export functionality
- [ ] Integration with Toggl/Clockify APIs
- [ ] Team velocity aggregation
- [ ] Cost savings calculator (hourly rate × time saved)
