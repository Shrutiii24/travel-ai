export async function POST(request) {
  const { query } = await request.json();
  return Response.json({
    message: 'Search received!',
    query,
  });
}
