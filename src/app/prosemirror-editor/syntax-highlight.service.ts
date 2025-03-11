import { Injectable } from '@angular/core';
import { Node } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const syntaxHighlightKey = new PluginKey('syntaxHighlight');

interface Token {
  type: 'operator' | 'number' | 'function' | 'property' | 'bracket' | 'error';
  from: number;
  to: number;
  text: string;
  isPropertyNode?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SyntaxHighlightService {
  private propertyLabels: Set<string> = new Set();
  private functionNames: Set<string> = new Set(['Avg', 'Sum', 'Scale']);

  setPropertyLabels(labels: string[]) {
    this.propertyLabels = new Set(labels);
  }

  createPlugin(): Plugin {
    return new Plugin({
      key: syntaxHighlightKey,
      state: {
        init: (_, { doc }) => {
          return this.getDecorations(doc);
        },
        apply: (tr, oldState) => {
          if (!tr.docChanged) {
            return oldState.map(tr.mapping, tr.doc);
          }
          return this.getDecorations(tr.doc);
        }
      },
      props: {
        decorations(state) {
          return this.getState(state);
        }
      }
    });
  }

  private errors: Array<{ message: string, token: Token }> = [];

  getErrors(): Array<{ message: string, token: Token }> {
    return this.errors;
  }

  private getDecorations(doc: Node): DecorationSet {
    const decorations: Decoration[] = [];
    const tokens: Token[] = [];
    
    doc.descendants((node, pos) => {
      if (node.type.name === 'property') {
        tokens.push({
          type: 'property',
          from: pos,
          to: pos + node.nodeSize,
          text: node.attrs['label'],
          isPropertyNode: true
        });
      } else if (node.isText) {
        tokens.push(...this.tokenize(node.text || '', pos));
      }
      return true;
    });

    // Sort tokens by position
    tokens.sort((a, b) => a.from - b.from);
    
    // Validate and get errors
    const validationErrors = this.validateTokens(tokens);
    this.errors = validationErrors;
    
    // Add decorations
    tokens.forEach(token => {
      const hasError = validationErrors.some(err => err.token === token);

      if (hasError && !token.isPropertyNode) {
        decorations.push(
          Decoration.inline(token.from, token.to, {
            class: 'syntax-error'
          })
        );
      }

      if (!token.isPropertyNode) {
        decorations.push(
          Decoration.inline(token.from, token.to, {
            class: `syntax-${token.type}`
          })
        );
      }
    });

    return DecorationSet.create(doc, decorations);
  }

  private tokenize(text: string, offset: number): Token[] {
    const tokens: Token[] = [];
    let pos = 0;

    while (pos < text.length) {
      let match: RegExpExecArray | null;
      
      // Skip whitespace
      if (/\s/.test(text[pos])) {
        pos++;
        continue;
      }

      // Match operators and comma
      if ((match = /^[+\-*/,]/.exec(text.slice(pos)))) {
        tokens.push({
          type: 'operator',
          from: offset + pos,
          to: offset + pos + match[0].length,
          text: match[0]
        });
        pos += match[0].length;
        continue;
      }

      // Match brackets
      if ((match = /^[()]/.exec(text.slice(pos)))) {
        tokens.push({
          type: 'bracket',
          from: offset + pos,
          to: offset + pos + 1,
          text: match[0]
        });
        pos += 1;
        continue;
      }

      // Match numbers
      if ((match = /^\d+(\.\d+)?/.exec(text.slice(pos)))) {
        tokens.push({
          type: 'number',
          from: offset + pos,
          to: offset + pos + match[0].length,
          text: match[0]
        });
        pos += match[0].length;
        continue;
      }

      // Match functions or properties (identifiers)
      if ((match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(text.slice(pos)))) {
        const identifier = match[0];
        const type = this.functionNames.has(identifier) ? 'function' :
                    this.propertyLabels.has(identifier) ? 'property' : 'error';
        
        tokens.push({
          type,
          from: offset + pos,
          to: offset + pos + identifier.length,
          text: identifier
        });
        pos += identifier.length;
        continue;
      }

      // Skip unrecognized character
      pos++;
    }

    return tokens;
  }

  private validateTokens(tokens: Token[]): Array<{ message: string, token: Token }> {
    const errors: Array<{ message: string, token: Token }> = [];
    let expectingOperand = true;
    const parenStack: Array<{ token: Token, isFunction: boolean }> = [];
    let lastToken: Token | null = null;
    let insideFunction = false;
    let expectingComma = false;

    tokens.forEach((token, i) => {
      if (token.type === 'function') {
        if (!expectingOperand && lastToken && 
            lastToken.type !== 'operator' && 
            lastToken.type !== 'bracket') {
          errors.push({
            message: `Missing operator before function '${token.text}'`,
            token
          });
        }
        expectingOperand = false;
      } 
      else if (token.type === 'bracket') {
        if (token.text === '(') {
          const isFunction = lastToken?.type === 'function';
          if (!isFunction && !expectingOperand && lastToken && 
              lastToken.type !== 'operator' && 
              lastToken.type !== 'bracket') {
            errors.push({
              message: `Missing operator before '('`,
              token
            });
          }
          parenStack.push({ token, isFunction });
          insideFunction = isFunction;
          expectingOperand = true;
          expectingComma = false;
        } else { // closing bracket
          if (parenStack.length === 0) {
            errors.push({
              message: `Unmatched closing parenthesis ')'`,
              token
            });
          } else {
            const openParen = parenStack.pop()!;
            insideFunction = parenStack.length > 0 && parenStack[parenStack.length - 1].isFunction;
          }
          expectingOperand = false;
          expectingComma = false;
        }
      }
      else if (token.type === 'operator') {
        if (token.text === ',') {
          if (!insideFunction) {
            errors.push({
              message: `Unexpected comma outside of function call`,
              token
            });
          } else if (!expectingComma) {
            errors.push({
              message: `Unexpected comma`,
              token
            });
          }
          expectingOperand = true;
          expectingComma = false;
        } else { // other operators
          if (insideFunction) {
            errors.push({
              message: `Operators not allowed inside function arguments`,
              token
            });
          } else {
            if (expectingOperand) {
              errors.push({
                message: `Unexpected operator '${token.text}' at start of expression or after another operator`,
                token
              });
            }
            expectingOperand = true;
          }
        }
      } 
      else { // property or number
        if (!expectingOperand && lastToken) {
          if (insideFunction) {
            if (!expectingComma && lastToken.type !== 'bracket') {
              errors.push({
                message: `Expected comma between function arguments`,
                token
              });
            }
          } else if (lastToken.type !== 'operator' && lastToken.type !== 'bracket') {
            errors.push({
              message: `Missing operator between '${lastToken.text}' and '${token.text}'`,
              token
            });
          }
        }
        expectingOperand = false;
        expectingComma = insideFunction;
      }
      lastToken = token;
    });

    // Check for unclosed parentheses
    parenStack.forEach(({ token }) => {
      errors.push({
        message: `Unclosed parenthesis '(' from position ${token.from}`,
        token
      });
    });

    // Check if expression ends with operator (except closing parenthesis)
    if (expectingOperand && tokens.length > 0) {
      const lastToken = tokens[tokens.length - 1];
      if (lastToken.type === 'operator' && lastToken.text !== ')') {
        errors.push({
          message: `Expression cannot end with operator '${lastToken.text}'`,
          token: lastToken
        });
      }
    }

    return errors;
  }
}
