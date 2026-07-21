type CloseHandler = () => void;

const stack: CloseHandler[] = [];

export function pushModal(onClose: CloseHandler) {
  stack.push(onClose);
}

export function popModal(onClose: CloseHandler) {
  const index = stack.lastIndexOf(onClose);
  if (index !== -1) stack.splice(index, 1);
}

export function closeTopModal(): boolean {
  const top = stack[stack.length - 1];
  if (top) {
    top();
    return true;
  }
  return false;
}

export function hasOpenModal(): boolean {
  return stack.length > 0;
}
