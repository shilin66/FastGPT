import type { ReactNode } from 'react';
import React, { useRef } from 'react';
import type { OnChange } from '@monaco-editor/react';
import { Editor } from '@monaco-editor/react';

interface MonacoEditorProps {
  value: string;
  setCode: (code: string) => void;
  editorLoading: ReactNode;
}

const MonacoEditor = ({ value, setCode, editorLoading }: MonacoEditorProps) => {
  const editorRef = useRef<any>(null);
  const handleEditorChange: OnChange = (value) => {
    if (value) {
      setCode(value);
    }
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  return (
    <Editor
      height="100%"
      width="90%"
      language="json"
      defaultValue={'"desc":"this is a josn"'}
      value={value}
      theme="vs-dark"
      options={{
        formatOnPaste: true,
        formatOnType: true
      }}
      loading={editorLoading}
      onChange={handleEditorChange}
    />
  );
};

export default MonacoEditor;
