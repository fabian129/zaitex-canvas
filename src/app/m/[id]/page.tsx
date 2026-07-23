import MoodboardCanvas from "@/components/canvas/MoodboardCanvas";

export default async function MoodboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MoodboardCanvas moodboardId={id} />;
}
