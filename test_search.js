const allProducts = [{name: "Tomatoes 1kg", aisle: "Fresh Produce"}, {name: "Amul Milk 1L", aisle: "Dairy"}];
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i-1) === a.charAt(j-1)) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}
function search(q) {
    q = q.trim().toLowerCase();
    return allProducts.filter(p => {
      const name = p.name.toLowerCase();
      if (name.includes(q)) return true;
      if (q.length > 2) {
        const words = name.split(' ');
        for (const w of words) {
          if (w.length > 2 && levenshtein(q, w) <= 2) return true;
        }
      }
      return false;
    });
}
console.log("tomat:", search("tomat"));
console.log("milkk:", search("milkk"));
