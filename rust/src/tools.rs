use serde::{Deserialize, Serialize};
use reqwest::Client;

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub stargazers_count: u64,
    pub language: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResult {
    items: Vec<RepoInfo>,
}

pub struct ToolsHandler {
    client: Client,
}

impl Default for ToolsHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolsHandler {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("dial-a-repo-rust")
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn load_repo(&self, repo_spec: &str) -> Result<RepoInfo, String> {
        let clean_spec = repo_spec.trim_start_matches("https://github.com/").trim();

        let url = if clean_spec.contains('/') {
            format!("https://api.github.com/repos/{}", clean_spec)
        } else {
            format!("https://api.github.com/search/repositories?q={}+in:name+fork:false&sort=stars&order=desc&per_page=1", clean_spec)
        };

        if clean_spec.contains('/') {
            let resp = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("GitHub API returned status {}", resp.status()));
            }
            resp.json::<RepoInfo>().await.map_err(|e| e.to_string())
        } else {
            let resp = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
            let search: SearchResult = resp.json().await.map_err(|e| e.to_string())?;
            search.items.into_iter().next().ok_or_else(|| format!("No public repo found matching '{}'", clean_spec))
        }
    }
}
