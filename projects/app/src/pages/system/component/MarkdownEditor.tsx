import type { ReactNode } from 'react';
import React from 'react';
import type { OnChange } from '@monaco-editor/react';
import { Editor } from '@monaco-editor/react';
import Markdown from '@/components/Markdown';

interface MonacoEditorProps {
  value: string;
  setCode: (code: string) => void;
  editorLoading: ReactNode;
}

const MonacoEditor = ({ value, setCode, editorLoading }: MonacoEditorProps) => {
  const handleEditorChange: OnChange = (value) => {
    if (value) {
      setCode(value);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <div style={{ flex: 1, display: 'flex', width: '50%' }}>
        <Editor
          height="100%"
          width="100%"
          language="markdown"
          value={value}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            lineNumbers: 'off',
            overviewRulerLanes: 0,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 14,
            formatOnPaste: true,
            formatOnType: true
          }}
          onChange={handleEditorChange}
          loading={editorLoading}
          defaultValue="# Welcome to Markdown\nStart writing your markdown here..."
        />
      </div>

      <div
        style={{
          flex: 1,
          padding: '20px',
          backgroundColor: '#ffffff',
          overflowY: 'auto',
          borderLeft: '1px solid #ddd'
        }}
      >
        <Markdown source={value}></Markdown>
      </div>
    </div>
  );
};

export default MonacoEditor;
