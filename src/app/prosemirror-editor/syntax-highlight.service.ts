import { Injectable } from '@angular/core';
import { Node } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

// Token types for syntax highlighting
export enum TokenType {
  Operator = 'operator',
  Function = 'function',
  Property = 'property',
  Number = 'number',
  Bracket = 'bracket',
  Error = 'error'
}

// Token interface for parsed content
interface Token {
  type: TokenType;
  from: number;
  to: number;
  text: string;
}

// Error interface for linting
interface SyntaxError {
  from: number;
  to: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class SyntaxHighlightService {
  // Known operators, functions, and properties
  private operators = ['+', '-', '*', '/', '(', ')'];
  private functions = ['Avg', 'Sum', 'Scale'];
  private propertyLabels: string[] = [];

  // Set available property labels for highlighting
  setPropertyLabels(labels: string[]): void {
    this.propertyLabels = labels;
  }

  // Create a plugin for syntax highlighting, bracket matching, and linting
  createSyntaxHighlightPlugin(): Plugin {
    return new Plugin({
      key: new PluginKey('syntaxHighlight'),
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, oldSet, oldState, newState) => {
          // Reapply decorations if document changed or selection changed
          if (tr.docChanged || tr.selection !== oldState.selection) {
            return this.getDecorations(newState);
          }
          
          // Map decorations through document changes
          return oldSet.map(tr.mapping, tr.doc);
        }
      },
      props: {
        decorations(state) {
          return this.getState(state);
        }
      }
    });
  }

  // Get all decorations for the current document state
  private getDecorations(state: EditorState): DecorationSet {
    const doc = state.doc;
    const decorations: Decoration[] = [];
    
    // Parse the document for tokens
    const tokens = this.parseDocument(doc);
    
    // Add syntax highlighting decorations
    tokens.forEach(token => {
      if (token.type !== TokenType.Error) {
        decorations.push(
          Decoration.inline(token.from, token.to, {
            class: `syntax-${token.type}`
          })
        );
      }
    });
    
    // Add bracket matching decorations if cursor is at a bracket
    const bracketMatch = this.findMatchingBracket(state);
    if (bracketMatch) {
      decorations.push(
        Decoration.inline(bracketMatch.open.from, bracketMatch.open.to, {
          class: 'bracket-match'
        }),
        Decoration.inline(bracketMatch.close.from, bracketMatch.close.to, {
          class: 'bracket-match'
        })
      );
    }
    
    // Add linting decorations
    const errors = this.lintDocument(tokens);
    errors.forEach(error => {
      decorations.push(
        Decoration.inline(error.from, error.to, {
          class: 'syntax-error',
          title: error.message
        })
      );
    });
    
    return DecorationSet.create(doc, decorations);
  }

  // Parse the document into tokens
  private parseDocument(doc: Node): Token[] {
    const tokens: Token[] = [];
    
    // Process each text node
    doc.descendants((node, pos) => {
      if (node.isText) {
        const text = node.text || '';
        let index = 0;
        
        // Process the text character by character
        while (index < text.length) {
          // Skip whitespace
          if (/\s/.test(text[index])) {
            index++;
            continue;
          }
          
          // Check for operators
          if (this.operators.includes(text[index])) {
            const type = text[index] === '(' || text[index] === ')' 
              ? TokenType.Bracket 
              : TokenType.Operator;
            
            tokens.push({
              type,
              from: pos + index,
              to: pos + index + 1,
              text: text[index]
            });
            
            index++;
            continue;
          }
          
          // Check for numbers
          if (/\d/.test(text[index])) {
            const start = index;
            while (index < text.length && /[\d.]/.test(text[index])) {
              index++;
            }
            
            tokens.push({
              type: TokenType.Number,
              from: pos + start,
              to: pos + index,
              text: text.slice(start, index)
            });
            
            continue;
          }
          
          // Check for functions and properties
          if (/[A-Za-z]/.test(text[index])) {
            const start = index;
            while (index < text.length && /[A-Za-z0-9_]/.test(text[index])) {
              index++;
            }
            
            const word = text.slice(start, index);
            
            // Check if it's a function
            if (this.functions.some(f => f === word)) {
              tokens.push({
                type: TokenType.Function,
                from: pos + start,
                to: pos + index,
                text: word
              });
            } 
            // Check if it's a property
            else if (this.propertyLabels.some(p => p === word)) {
              tokens.push({
                type: TokenType.Property,
                from: pos + start,
                to: pos + index,
                text: word
              });
            }
            
            continue;
          }
          
          // Skip any other character
          index++;
        }
      }
    });
    
    return tokens;
  }

  // Find matching brackets when cursor is at a bracket
  private findMatchingBracket(state: EditorState): { open: Token, close: Token } | null {
    const { doc, selection } = state;
    const { from } = selection;
    
    // Get character at cursor position
    const pos = from - 1;
    if (pos < 0) return null;
    
    const charBefore = doc.textBetween(pos, pos + 1);
    const charAfter = doc.textBetween(from, from + 1);
    
    // Check if cursor is at a bracket
    if (charBefore !== '(' && charBefore !== ')' && 
        charAfter !== '(' && charAfter !== ')') {
      return null;
    }
    
    // Find all brackets in the document
    const brackets: Token[] = [];
    doc.descendants((node, nodePos) => {
      if (node.isText) {
        const text = node.text || '';
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '(' || text[i] === ')') {
            brackets.push({
              type: TokenType.Bracket,
              from: nodePos + i,
              to: nodePos + i + 1,
              text: text[i]
            });
          }
        }
      }
    });
    
    // Find the bracket at or near cursor position
    const cursorBracket = brackets.find(b => 
      (charBefore === '(' || charBefore === ')') ? b.from === pos : b.from === from
    );
    
    if (!cursorBracket) return null;
    
    // Find matching bracket
    if (cursorBracket.text === '(') {
      // Find closing bracket
      let depth = 1;
      for (let i = brackets.indexOf(cursorBracket) + 1; i < brackets.length; i++) {
        if (brackets[i].text === '(') depth++;
        else if (brackets[i].text === ')') depth--;
        
        if (depth === 0) {
          return { open: cursorBracket, close: brackets[i] };
        }
      }
    } else {
      // Find opening bracket
      let depth = 1;
      for (let i = brackets.indexOf(cursorBracket) - 1; i >= 0; i--) {
        if (brackets[i].text === ')') depth++;
        else if (brackets[i].text === '(') depth--;
        
        if (depth === 0) {
          return { open: brackets[i], close: cursorBracket };
        }
      }
    }
    
    return null;
  }

  // Lint the document for syntax errors
  private lintDocument(tokens: Token[]): SyntaxError[] {
    const errors: SyntaxError[] = [];
    
    // Check for unmatched brackets
    const bracketStack: Token[] = [];
    tokens.forEach(token => {
      if (token.type === TokenType.Bracket) {
        if (token.text === '(') {
          bracketStack.push(token);
        } else if (token.text === ')') {
          if (bracketStack.length === 0) {
            errors.push({
              from: token.from,
              to: token.to,
              message: 'Unmatched closing bracket'
            });
          } else {
            bracketStack.pop();
          }
        }
      }
    });
    
    // Add errors for unmatched opening brackets
    bracketStack.forEach(token => {
      errors.push({
        from: token.from,
        to: token.to,
        message: 'Unmatched opening bracket'
      });
    });
    
    // Check for invalid operator sequences
    for (let i = 0; i < tokens.length - 1; i++) {
      const current = tokens[i];
      const next = tokens[i + 1];
      
      if (current.type === TokenType.Operator && 
          next.type === TokenType.Operator &&
          current.text !== '(' && next.text !== '(' && 
          current.text !== ')' && next.text !== ')') {
        errors.push({
          from: current.from,
          to: next.to,
          message: 'Invalid operator sequence'
        });
      }
    }
    
    return errors;
  }
} 