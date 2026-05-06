use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "modifiedTime")]
    pub modified_time: Option<String>,
}

#[derive(Deserialize)]
struct DriveFileList {
    files: Vec<DriveFile>,
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn list_folders(parent_id: &str, api_key: &str) -> Result<Vec<DriveFile>, String> {
    let client = build_client()?;
    let url = format!(
        "https://www.googleapis.com/drive/v3/files\
         ?q=%27{parent_id}%27+in+parents+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27\
         &fields=files(id,name,modifiedTime)\
         &key={api_key}"
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive API error {status}: {body}"));
    }

    let list: DriveFileList = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.files)
}

pub async fn list_files(folder_id: &str, api_key: &str) -> Result<Vec<DriveFile>, String> {
    let client = build_client()?;
    let url = format!(
        "https://www.googleapis.com/drive/v3/files\
         ?q=%27{folder_id}%27+in+parents+and+mimeType!%3D%27application%2Fvnd.google-apps.folder%27\
         &fields=files(id,name,modifiedTime)\
         &key={api_key}"
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive API error {status}: {body}"));
    }

    let list: DriveFileList = resp.json().await.map_err(|e| e.to_string())?;
    Ok(list.files)
}

pub async fn download_file(file_id: &str, api_key: &str) -> Result<String, String> {
    let client = build_client()?;
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&key={api_key}"
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive download error {status}: {body}"));
    }

    let content = resp.text().await.map_err(|e| e.to_string())?;
    Ok(content)
}
