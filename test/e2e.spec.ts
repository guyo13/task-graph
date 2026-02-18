import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Task Dependency Graph App', () => {
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

  test('should add a new task', async ({ page }) => {
    const taskName = 'New Task 1';
    await page.fill('#taskInput', taskName);
    await page.click('text=Add Task');

    // Verify task is added to dependency list
    const checkboxLabel = page.locator('#dependencyList label', { hasText: taskName });
    await expect(checkboxLabel).toBeVisible();

    // Verify task is added to graph
    const nodeCount = await page.evaluate(() => window['cy'].nodes().length);
    expect(nodeCount).toBe(1);

    const label = await page.evaluate(() => window['cy'].nodes()[0].data('label'));
    expect(label).toBe(taskName);
  });

  test('should show error when adding empty task', async ({ page }) => {
    await page.click('text=Add Task');
    await expect(page.locator('#errorMsg')).toBeVisible();
    await expect(page.locator('#errorMsg')).toHaveText('Please enter a task name');
  });

  test('should add a task with dependency', async ({ page }) => {
    // Add first task
    await page.fill('#taskInput', 'Task A');
    await page.click('text=Add Task');

    // Select dependency
    await page.check('#dependencyList input[type="checkbox"]');

    // Add second task
    await page.fill('#taskInput', 'Task B');
    await page.click('text=Add Task');

    // Verify both tasks exist
    const nodeCount = await page.evaluate(() => window['cy'].nodes().length);
    expect(nodeCount).toBe(2);

    // Verify edge exists
    const edgeCount = await page.evaluate(() => window['cy'].edges().length);
    expect(edgeCount).toBe(1);

    // Verify edge source and target
    const edgeData = await page.evaluate(() => window['cy'].edges()[0].data());
    // IDs are generated, so we can't check exact IDs easily without more logic,
    // but we know there's 1 edge.
    expect(edgeData).toHaveProperty('source');
    expect(edgeData).toHaveProperty('target');
  });

  test('should search and filter dependencies', async ({ page }) => {
    await page.fill('#taskInput', 'Apple');
    await page.click('text=Add Task');

    await page.fill('#taskInput', 'Banana');
    await page.click('text=Add Task');

    // Search for Apple
    await page.fill('#depSearch', 'App');

    // Verify Apple is visible
    await expect(page.locator('#dependencyList label', { hasText: 'Apple' })).toBeVisible();

    // Verify Banana is hidden
    await expect(page.locator('#dependencyList label', { hasText: 'Banana' })).toBeHidden();
  });

  test('should reset all tasks', async ({ page }) => {
    await page.fill('#taskInput', 'Task to Delete');
    await page.click('text=Add Task');

    // Click Reset
    await page.click('#resetBtn');

    // Check confirmation dialog
    await expect(page.locator('#resetConfirm')).toBeVisible();

    // Confirm
    await page.click('text=Yes, Clear');

    // Verify empty list
    await expect(page.locator('#emptyMsg')).toBeVisible();

    // Verify empty graph
    const nodeCount = await page.evaluate(() => window['cy'].nodes().length);
    expect(nodeCount).toBe(0);
  });

  test('should export to CSV', async ({ page }) => {
    await page.fill('#taskInput', 'Task Export');
    await page.click('text=Add Task');

    const downloadPromise = page.waitForEvent('download');
    await page.click('button[title="Export CSV"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('dependency_graph.csv');
  });

  test('should export to Image', async ({ page }) => {
    await page.fill('#taskInput', 'Task Image');
    await page.click('text=Add Task');

    const downloadPromise = page.waitForEvent('download');
    await page.click('button[title="Export Image"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('dependency_graph.png');
  });

  test('should import from CSV', async ({ page }) => {
    const csvContent = 'id,text,dependencies\nt1,"Imported Task 1",\nt2,"Imported Task 2",t1\n';
    const csvFile = path.join(test.info().project.outputDir, 'import.csv');

    // Create dummy CSV file
    if (!fs.existsSync(path.dirname(csvFile))) {
        fs.mkdirSync(path.dirname(csvFile), { recursive: true });
    }
    fs.writeFileSync(csvFile, csvContent);

    // Upload file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button[title="Import CSV"]');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(csvFile);

    // Verify tasks imported
    await expect(page.locator('#dependencyList label', { hasText: 'Imported Task 1' })).toBeVisible();
    await expect(page.locator('#dependencyList label', { hasText: 'Imported Task 2' })).toBeVisible();

    // Verify graph structure (2 nodes, 1 edge)
    const nodeCount = await page.evaluate(() => window['cy'].nodes().length);
    expect(nodeCount).toBe(2);

    const edgeCount = await page.evaluate(() => window['cy'].edges().length);
    expect(edgeCount).toBe(1);
  });
});
