//
//  app.ts
//  Fillout Engineering Screening
//  Assignment URL: https://fillout.notion.site/Software-engineering-screen-fbd58fd78f59495c99866b91b1358221
//  Purpose: Mimic existing Fillout API endpoint and apply filtering options
//
//  Created by Joseph Ramkishun on 03/06/24.
//

import express, { Express, Request, Response } from "express";
import axios, { AxiosResponse, AxiosError } from "axios";
import dotenv from "dotenv";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "http://localhost";

app.use(express.json());

type QuestionType = {
  id: string;
  name: string;
  type: string;
  value: number | string;
};

type SubmissionType = {
  submissionId: string;
  submissionTime: string;
  lastUpdatedAt: string;
  questions: QuestionType[];
  calculations: any[];
  urlParameters: any[];
  quiz: any;
  documents: any[];
};

type FilterClauseType = {
  id: string;
  condition: "equals" | "does_not_equal" | "greater_than" | "less_than";
  value: number | string;
};

type ReturnType = {
  responses: SubmissionType[];
  totalResponses: number;
  pageCount: number;
};
// Assuming we have all the data we need from the API
function paginateData(
  data: SubmissionType[],
  limit: number,
  offset: number
): ReturnType {
  const startIndex: number = offset;
  const endIndex: number = offset + limit;
  const responses: Array<SubmissionType> = data.slice(startIndex, endIndex);
  const totalResponses: number = responses.length;
  const pageCount: number = Math.ceil(data.length / limit);
  return {
    responses: responses,
    totalResponses: totalResponses,
    pageCount: pageCount,
  };
}

app.get("/:formId/filteredResponses", async (req: Request, res: Response) => {
  const formId = req.params.formId;
  const filterClauses: FilterClauseType[] = req.body;
  const authorizationHeader = req.headers.authorization as string;
  const limit = parseInt(req.query.limit as string) || 150;
  const offset = parseInt(req.query.offset as string) || 0;
  // Ensure authorization header is present
  if (!authorizationHeader) {
    res.status(403);
    throw new Error("Please provide a valid API key.");
  }
  // Ensure a form ID was handed in
  if (!formId) {
    res.status(400);
    throw new Error("Please provide a valid form ID.");
  }

  const config = {
    headers: {
      Authorization: authorizationHeader,
    },
  };

  if (!Array.isArray(filterClauses)) {
    return res
      .status(400)
      .json({ error: "Invalid filter clauses - must be an array" });
  }

  if (!req.body || filterClauses.length === 0) {
    return res.status(400).json({ error: "Please provide atleast 1 filter." });
  }

  try {
    let response: AxiosResponse;

    // If we were not assuming we had all of the information. Otherwise we would iterate this API call until we hit our limit after filtering.
    // const response = await axios.get(url + `?limit=${limit}&offset=${offset}`, config);
    response = await axios.get(
      `https://api.fillout.com/v1/api/forms/${formId}/submissions`,
      config
    );

    if (response.status !== 200) {
      throw new Error(
        response.data.message ||
          `Request failed with status code ${response.status}`
      );
    }

    const submissions: SubmissionType[] = response.data.responses;

    if (!Array.isArray(submissions)) {
      console.error("Filters must be nested in an array.");
      return res.status(400).json({ error: "Filters must be nested in an array." });
    }

    const filteredSubmissions = submissions.filter((submission) => {
      return filterClauses.every((clause) => {
        // Iterate through indivisual responses by ID
        const question = submission.questions.find((q) => q.id === clause.id);
        // Ignore if id does not match
        if (!question) {
          return false;
        }
        // Type cast for our greater and less than comparison 
        const filterValue =
          question.type == "DatePicker"
            ? new Date(question.value).getTime()
            : Number(question.value);
        const filterClause =
          question.type == "DatePicker"
            ? new Date(clause.value).getTime()
            : Number(clause.value);
        // Ensure the comparison is valid
        if (typeof filterValue !== typeof filterClause) {
          console.error(
            `Invalid filter type for ${question.id}`
          );
          return res.status(400).json({ error: `Invalid filter type for ${question.id}` });
        }
        // Switch case for filter type
        switch (clause.condition) {
          case "equals":
            return question.value === clause.value;
          case "does_not_equal":
            return question.value !== clause.value;
          case "greater_than":
            return filterValue > filterClause;
          case "less_than":
            return filterValue < filterClause;
          default:
            return false;
        }
      });
    });

    res.json(paginateData(filteredSubmissions, limit, offset));
  } catch (error) {
    // Handle any fetch errors
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(
        `API error: ${axiosError.message}, Status Code: ${axiosError.response?.status}`
      );
      res
        .status(axiosError.response?.status || 500)
        .json({ error: axiosError.message });
    } else {
      console.error(`Error: ${error}`);
      res.status(500).json({ error: "Internal Server Error" });
    }

    console.error("Error filtering submissions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on ${host}:${port}`);
});
