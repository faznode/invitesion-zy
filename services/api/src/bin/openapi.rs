//! Prints the OpenAPI document exactly as committed in `openapi.json`.

fn main() {
    print!("{}", invitesion_api::openapi::document_json());
}
