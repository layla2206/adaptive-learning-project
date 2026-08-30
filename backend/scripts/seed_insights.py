import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import supabase

def seed_insights():
    print("Seeding mock students and mistake data for 'Where Students Are Stuck'...")

    course_id = "cs301"
    topic_id = "top-sort1"

    # We need real UUIDs for students
    student1 = str(uuid.uuid4())
    student2 = str(uuid.uuid4())
    student3 = str(uuid.uuid4())

    students_data = [
        {"student_id": student1, "name": "Alice Demo", "email": "alice.demo@example.edu"},
        {"student_id": student2, "name": "Bob Demo", "email": "bob.demo@example.edu"},
        {"student_id": student3, "name": "Charlie Demo", "email": "charlie.demo@example.edu"}
    ]
    
    # 1. Insert students (we don't strictly need users/passwords since they won't log in, they just populate stats)
    supabase.table("students").insert(students_data).execute()
    print("Inserted 3 mock students.")

    # 2. Enrollments
    enrollments_data = [
        {"enrollment_id": str(uuid.uuid4())[:10], "student_id": student1, "course_id": course_id},
        {"enrollment_id": str(uuid.uuid4())[:10], "student_id": student2, "course_id": course_id},
        {"enrollment_id": str(uuid.uuid4())[:10], "student_id": student3, "course_id": course_id},
    ]
    supabase.table("enrollments").insert(enrollments_data).execute()
    print("Enrolled students in cs301.")

    # 3. retry_attempts (at least 2 each for topic_id to be 'stuck')
    retries_data = [
        {"retry_id": str(uuid.uuid4())[:15], "student_id": student1, "topic_id": topic_id, "attempt_number": 1, "format_used": "Worked Example"},
        {"retry_id": str(uuid.uuid4())[:15], "student_id": student1, "topic_id": topic_id, "attempt_number": 2, "format_used": "Diagram"},
        {"retry_id": str(uuid.uuid4())[:15], "student_id": student2, "topic_id": topic_id, "attempt_number": 1, "format_used": "Hands-on Task"},
        {"retry_id": str(uuid.uuid4())[:15], "student_id": student2, "topic_id": topic_id, "attempt_number": 2, "format_used": "Worked Example"},
        {"retry_id": str(uuid.uuid4())[:15], "student_id": student3, "topic_id": topic_id, "attempt_number": 1, "format_used": "Hands-on Task"},
        {"retry_id": str(uuid.uuid4())[:15], "student_id": student3, "topic_id": topic_id, "attempt_number": 2, "format_used": "Diagram"}
    ]
    supabase.table("retry_attempts").insert(retries_data).execute()
    print("Added retry attempts to trigger 'stuck' logic.")

    # 4. student_profiles (<100 mastery)
    profiles_data = [
        {"student_id": student1, "topic_id": topic_id, "mastery_percent": 20},
        {"student_id": student2, "topic_id": topic_id, "mastery_percent": 40},
        {"student_id": student3, "topic_id": topic_id, "mastery_percent": 60}
    ]
    supabase.table("student_profiles").insert(profiles_data).execute()
    print("Set low mastery scores.")

    # 5. student_answers (with mistake tags)
    answers_data = [
        # Alice and Bob have Concept Confusion
        {"answer_id": str(uuid.uuid4())[:15], "student_id": student1, "topic_id": topic_id, "mistake_tag": "concept_confusion"},
        {"answer_id": str(uuid.uuid4())[:15], "student_id": student1, "topic_id": topic_id, "mistake_tag": "concept_confusion"}, # Duplicate tag to prove distinct count works
        {"answer_id": str(uuid.uuid4())[:15], "student_id": student2, "topic_id": topic_id, "mistake_tag": "concept_confusion"},
        
        # Bob also has Calculation Error
        {"answer_id": str(uuid.uuid4())[:15], "student_id": student2, "topic_id": topic_id, "mistake_tag": "calculation_error"},

        # Charlie has Incomplete
        {"answer_id": str(uuid.uuid4())[:15], "student_id": student3, "topic_id": topic_id, "mistake_tag": "incomplete"},
    ]
    supabase.table("student_answers").insert(answers_data).execute()
    print("Added student answers with mistake tags.")
    
    print("\nSuccess! The Instructor Insights table should now show 3 stuck students for 'top-sort1' with 'concept_confusion', 'calculation_error', and 'incomplete' breakdown.")

if __name__ == "__main__":
    seed_insights()
