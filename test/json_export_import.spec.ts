import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Task Dependency Graph JSON Export/Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Proxy the global 'cytoscape' function to capture the instance
      let originalCytoscape;
      Object.defineProperty(window, 'cytoscape', {
        get() { return originalCytoscape; },
        set(v) {
          originalCytoscape = function(...args) {
             const cy = v(...args);
             window['cy'] = cy;
             return cy;
          };
          // Copy static properties if any
          Object.assign(originalCytoscape, v);
        },
        configurable: true
      });
    });
    await page.goto('/');
  });

  test('should export to JSON', async ({ page }) => {
    await page.fill('#taskInput', 'Task Export JSON');
    await page.click('text=Add Task');

    const downloadPromise = page.waitForEvent('download');
    await page.click('button[title="Export JSON"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('dependency_graph.json');

    // Verify content
    const downloadPath = await download.path();
    const content = fs.readFileSync(downloadPath, 'utf-8');
    const data = JSON.parse(content);

    expect(data).toHaveProperty('tasks');
    expect(data.tasks.length).toBe(1);
    expect(data.tasks[0].text).toBe('Task Export JSON');
  });

  test('should import from JSON', async ({ page }) => {
    const jsonContent = JSON.stringify({
        tasks: [
            { id: 't1', text: 'Imported JSON Task 1', dependencies: [] },
            { id: 't2', text: 'Imported JSON Task 2', dependencies: ['t1'] }
        ]
    });
    const jsonFile = path.join(test.info().project.outputDir, 'import.json');

    // Create dummy JSON file
    if (!fs.existsSync(path.dirname(jsonFile))) {
        fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
    }
    fs.writeFileSync(jsonFile, jsonContent);

    // Upload file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button[title="Import JSON"]');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(jsonFile);

    // Verify tasks imported
    await expect(page.locator('#dependencyList label', { hasText: 'Imported JSON Task 1' })).toBeVisible();
    await expect(page.locator('#dependencyList label', { hasText: 'Imported JSON Task 2' })).toBeVisible();

    // Verify graph structure (2 nodes, 1 edge)
    const nodeCount = await page.evaluate(() => window['cy'].nodes().length);
    expect(nodeCount).toBe(2);

    const edgeCount = await page.evaluate(() => window['cy'].edges().length);
    expect(edgeCount).toBe(1);
  });
});
