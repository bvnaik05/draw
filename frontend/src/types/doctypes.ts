interface DocType {
    name: string;
    creation: string;
    modified: string;
    owner: string;
    modified_by: string;
  }

  interface ChildDocType extends DocType {
    parent?: string;
    parentfield?: string;
    parenttype?: string;
    idx?: number;
  }
  
// Last updated: 2026-06-15 00:00:00
export interface DrawFolder extends DocType {
  /** Folder Name: Data */
  folder_name: string;
  /** Parent Folder: Link (Draw Folder) */
  parent_folder?: string;
  /** Sort Order: Int */
  sort_order?: number;
  /** Is Pinned: Check */
  is_pinned: 0 | 1;
}

// Last updated: 2026-06-15 00:00:00
export interface DrawDiagram extends DocType {
  /** Title: Data */
  title?: string;
  /** Description: Small Text */
  description?: string;
  /** Folder: Link (Draw Folder) */
  folder?: string;
  /** Canvas Size: Select */
  canvas_size?: 'Widescreen 16:9' | 'Standard 4:3' | 'A4 Landscape' | 'A4 Portrait' | 'Letter Landscape' | 'Letter Portrait' | 'Square';
  /** Diagram Type: Select */
  diagram_type?: 'block' | 'mindmap' | 'flowchart' | 'whiteboard' | 'unified';
  /** Is Public: Check */
  is_public: 0 | 1;
  /** All Site Users Can View: Check */
  all_site_users_can_view: 0 | 1;
  /** Is Pinned: Check */
  is_pinned: 0 | 1;
  /** Revision: Int */
  revision?: number;
  /** Sort Order: Int */
  sort_order?: number;
  /** Is Trashed: Check */
  is_trashed: 0 | 1;
  /** Trashed On: Datetime */
  trashed_on?: string;
  /** Document: JSON */
  document?: any;
  /** CRDT State: Long Text */
  crdt_state?: any;
  /** Thumbnail: Attach Image */
  thumbnail?: string;
}
