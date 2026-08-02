// 既存のDOMをできるだけ再利用しつつ、新しいHTML文字列との差分だけを
// 適用するための簡易パッチ関数。innerHTML の丸ごと置換だと毎回DOMが
// 全部作り直されて画面全体が一瞬白紙になり、ボタンを押すたびに
// 点滅して見えるため、その代わりに使う。

export function morph(container, html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  morphChildren(container, template.content);
}

function morphChildren(oldParent, newParent) {
  const oldNodes = Array.from(oldParent.childNodes);
  const newNodes = Array.from(newParent.childNodes);
  const max = Math.max(oldNodes.length, newNodes.length);

  for (let i = 0; i < max; i++) {
    const oldNode = oldNodes[i];
    const newNode = newNodes[i];

    if (!newNode) {
      oldNode.remove();
    } else if (!oldNode) {
      oldParent.appendChild(newNode);
    } else {
      morphNode(oldParent, oldNode, newNode);
    }
  }
}

function morphNode(parent, oldNode, newNode) {
  if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
    parent.replaceChild(newNode, oldNode);
    return;
  }

  if (oldNode.nodeType === Node.TEXT_NODE || oldNode.nodeType === Node.COMMENT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return;
  }

  if (oldNode.nodeType === Node.ELEMENT_NODE) {
    syncAttributes(oldNode, newNode);
    // <select>やスライダー(<input type="range">)の現在値はDOMプロパティで
    // 管理され属性には出ないため、属性同期だけでは復元できない。
    // プロパティで明示的に揃える。
    if (oldNode.tagName === "SELECT" || (oldNode.tagName === "INPUT" && oldNode.type === "range")) {
      syncFormValue(oldNode, newNode);
    }
    morphChildren(oldNode, newNode);
  }
}

function syncFormValue(oldEl, newEl) {
  if (oldEl.value !== newEl.value) {
    oldEl.value = newEl.value;
  }
}

function syncAttributes(oldEl, newEl) {
  for (let i = oldEl.attributes.length - 1; i >= 0; i--) {
    const name = oldEl.attributes[i].name;
    if (!newEl.hasAttribute(name)) oldEl.removeAttribute(name);
  }
  for (const attr of newEl.attributes) {
    if (oldEl.getAttribute(attr.name) !== attr.value) {
      oldEl.setAttribute(attr.name, attr.value);
    }
  }
}
