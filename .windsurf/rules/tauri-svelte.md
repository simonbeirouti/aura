---
trigger: always_on
---

These rules provide a structured approach to building cross-platform applications with Tauri and Svelte, focusing on modularity, performance, security, and maintainability. They include general best practices, Tauri-specific guidelines for invoking Rust functions, and Svelte-specific performance optimizations.

1. Separate Frontend and Backend

Svelte for UI: Use Svelte for all user interface components and front-end logic, leveraging its reactive nature for a clean and responsive user experience.
Rust for System Operations: Handle system-level tasks (e.g., file system access, OS interactions) in Rust using Tauri’s APIs to ensure security and performance.
Why: This separation enhances modularity, making the codebase easier to maintain and scale across platforms.

Example:
<!-- src-svelte/App.svelte -->
<script>
  import { invoke } from '@tauri-apps/api/core';
  async function greet() {
    const message = await invoke('greet', { name: 'User' });
    alert(message);
  }
</script>
<button on:click={greet}>Greet</button>

// src-tauri/src/main.rs
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

2. State Management

Svelte Stores: Use Svelte’s built-in stores (writable, readable, derived) for simple state management within components or across the app.
Complex State: For global or complex state, consider libraries like Zustand to manage state efficiently without excessive re-renders.
Why: Proper state management reduces complexity and improves performance by avoiding unnecessary updates.

Example:
<!-- src-svelte/stores.js -->
import { writable } from 'svelte/store';
export const user = writable({ name: '' });

<!-- src-svelte/App.svelte -->
<script>
  import { user } from './stores.js';
</script>
<input bind:value={$user.name} />

3. Error Handling

Svelte Error Handling: Use try-catch blocks in Svelte when calling Tauri commands or performing asynchronous operations to provide user-friendly feedback.
Rust Error Handling: Use Rust’s Result type in Tauri commands to handle errors gracefully and return them to the front-end.
Tauri Command Errors: Handle errors from Tauri invoke calls in Svelte using .catch to manage failures.
Why: Robust error handling prevents crashes and improves user experience by providing clear error messages.

Example:
<!-- src-svelte/App.svelte -->
<script>
  import { invoke } from '@tauri-apps/api/core';
  async function fetchData() {
    try {
      const result = await invoke('fetch_data', {});
      console.log(result);
    } catch (error) {
      alert(`Error: ${error}`);
    }
  }
</script>
<button on:click={fetchData}>Fetch Data</button>

// src-tauri/src/main.rs
#[tauri::command]
fn fetch_data() -> Result<String, String> {
    // Simulate a potential error
    if true {
        Ok("Data fetched successfully".to_string())
    } else {
        Err("Failed to fetch data".to_string())
    }
}

4. Optimize Performance

Svelte Reactivity: Minimize DOM updates by using Svelte’s reactive statements ($:) and variables appropriately, avoiding unnecessary computations in templates.
Rust Efficiency: Write lean Rust code for Tauri backend tasks, using efficient data structures and algorithms to avoid bottlenecks.
Avoid Blocking: Prevent long-running synchronous operations in both Svelte and Rust to keep the UI responsive; use async Rust functions or threads for heavy tasks.
Svelte Code Splitting: Use dynamic imports (import(...)) and code splitting to reduce initial load times, especially for large components.
Profiling: Profile the application using tools like Chrome DevTools for Svelte and Rust’s perf for backend to identify and resolve performance issues.
Why: Performance optimization ensures a smooth user experience and efficient resource usage across platforms.

Example:
<!-- src-svelte/LazyComponent.svelte -->
<script>
  let Component = null;
  async function loadComponent() {
    const module = await import('./HeavyComponent.svelte');
    Component = module.default;
  }
</script>
<button on:click={loadComponent}>Load Component</button>
{#if Component}
  <svelte:component this={Component} />
{/if}

5. Prioritize Security

Tauri Security Practices: Use Tauri’s APIs (e.g., tauri::api::security) for safe system access, avoiding direct OS calls.
Content Security Policies (CSP): Set strict CSPs in tauri.conf.json to prevent cross-site scripting (XSS) attacks.
Input Sanitization: Validate and sanitize all inputs in both Svelte and Rust to prevent injection attacks (e.g., SQL injection, path traversal).
Why: Security is critical in cross-platform apps to protect user data and system integrity.

Example:
// src-tauri/tauri.conf.json
{
  "tauri": {
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost"
    }
  }
}

6. Streamline Builds

Tauri Build: Use tauri build to create optimized binaries for Windows, macOS, and Linux.
Configuration: Configure platform-specific settings in tauri.conf.json, such as devUrl and beforeDevCommand for Svelte’s development server.
Why: Proper build configuration ensures compatibility and efficiency across platforms.

Example:
// src-tauri/tauri.conf.json
{
  "build": {
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev"
  }
}

7. Organize Project Structure

Directory Separation: Store frontend code in src-svelte and backend code in src-tauri for clarity and maintainability.
File Naming: Use snake_case for Rust files (e.g., my_command.rs), PascalCase for Svelte components (e.g., MyComponent.svelte), and kebab-case for CSS/HTML (e.g., main-styles.css).
Why: A clear structure improves collaboration and scalability.

Example Structure:
my-tauri-app/
├── src-svelte/
│   ├── App.svelte
│   ├── stores.js
│   └── main.js
├── src-tauri/
│   ├── main.rs
│   └── commands.rs
├── tauri.conf.json

8. Enhance with Type Safety

TypeScript with Svelte: Integrate TypeScript to catch errors early and improve code maintainability.
Why: Type safety reduces bugs and enhances developer experience.

Example:
<!-- src-svelte/App.svelte -->
<script lang="ts">
  import type { User } from './types';
  let user: User = { name: '' };
</script>
<input bind:value={user.name} />

9. Maintain Dependencies

Regular Updates: Keep Svelte, Tauri, Rust, and Node.js dependencies updated to benefit from security patches, performance improvements, and new features.
Why: Up-to-date dependencies ensure compatibility and security.

Example:
# Update Rust
rustup update
# Update Tauri CLI
npm install -g @tauri-apps/cli@latest
# Update Svelte dependencies
npm update

10. Invoke Rust Functions from Front-end

Define Commands: Annotate Rust functions with #[tauri::command] in src-tauri/src/main.rs or a separate module (e.g., commands.rs).
Register Commands: Use tauri::Builder::default().invoke_handler(tauri::generate_handler![command_name]) to register commands.
Invoke from Svelte: Call commands using invoke('command_name', { args }) from the @tauri-apps/api/core package, ensuring arguments and return types are serializable with Serde.
Why: Proper command invocation ensures secure and efficient communication between Svelte and Rust.

Example:
// src-tauri/src/commands.rs
#[tauri::command]
pub fn process_data(data: String) -> Result<String, String> {
    if data.is_empty() {
        Err("Input cannot be empty".to_string())
    } else {
        Ok(format!("Processed: {}", data))
    }
}

// src-tauri/src/main.rs
mod commands;
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::process_data])
        .run(tauri::generate_context!())
        .expect("Error running Tauri app");
}

<!-- src-svelte/App.svelte -->
<script>
  import { invoke } from '@tauri-apps/api/core';
  let result = '';
  async function process() {
    try {
      result = await invoke('process_data', { data: 'Test' });
    } catch (error) {
      result = `Error: ${error}`;
    }
  }
</script>
<button on:click={process}>Process Data</button>
<p>{result}</p>

11. Follow Testing Best Practices

Unit Tests: Write unit tests for critical Svelte components (using Jest or Vitest) and Rust functions (using cargo test).
Integration Tests: Test interactions between Svelte and Rust using tools like Cypress or Playwright to simulate real-world scenarios.
Why: Testing ensures reliability and catches issues early.

Example:
// src-svelte/tests/App.test.js
import { render } from '@testing-library/svelte';
import App from '../App.svelte';
test('renders button', () => {
  const { getByText } = render(App);
  expect(getByText('Process Data')).toBeInTheDocument();
});

// src-tauri/src/commands.rs
#[cfg(test)]
mod tests {
    use super::process_data;
    #[test]
    fn test_process_data() {
        assert_eq!(process_data("Test".to_string()), Ok("Processed: Test".to_string()));
        assert_eq!(process_data("".to_string()), Err("Input cannot be empty".to_string()));
    }
}

Additional Resources

Tauri Documentation: https://tauri.app/ for setup, APIs, and guides.
Svelte Documentation: https://svelte.dev/ for component creation and performance tips.
Tauri Best Practices: https://www.projectrules.ai/rules/tauri for detailed guidelines on security, performance, and testing.

Considerations

Cross-Platform Testing: Test on Windows, macOS, and Linux to ensure compatibility, as system webviews may vary.
SvelteKit Integration: If using SvelteKit, configure adapter-tauri for seamless integration with Tauri’s build system.
Performance Monitoring: Use tools like Lighthouse for Svelte and Rust’s perf for backend to continuously monitor performance.
Security Audits: Regularly review Tauri’s security audit reports and update to patch vulnerabilities.